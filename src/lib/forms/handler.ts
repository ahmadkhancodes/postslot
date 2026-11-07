import { retentionDays } from "@/lib/inbox/retention";
import { effectivePlan } from "@/lib/billing/entitlement";
import { countSpam } from "@/lib/billing/softcap";
import { recordEvent } from "@/lib/delivery/events";
import { processSubmission } from "@/lib/delivery/process";
import type { Deps } from "@/lib/delivery/dispatch";
import type { Db } from "@/lib/db/types";
import { env } from "@/lib/env";
import { checkSpamBurst, troubleshootBlockedOrigin } from "@/lib/notices";
import { clientIp } from "@/lib/http";
import { hmacSha256Hex, uuidv7 } from "@/lib/ids";
import { log } from "@/lib/logger";
import { verifyAltcha } from "@/lib/security/altcha";
import { RULES, rateLimit, type Rule } from "@/lib/security/ratelimit";
import { timeTokenSignals } from "@/lib/spam/timetoken";
import { ERROR_COPY, IngestError, buildSearchText, normaliseFields, originAllowed, parseBody, pickRedirect, requestOrigin, wantsJson } from "./ingest";
import type { Form, SpamSignal, Submission } from "./types";

export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept",
  "access-control-max-age": "86400",
  vary: "origin",
};
const BASE_HEADERS = { ...CORS, "cache-control": "no-store", "x-robots-tag": "noindex" };

const base = () => env().ALTCHA_HMAC_KEY ?? env().BETTER_AUTH_SECRET ?? "dev-altcha-secret-change-me";
export const timeTokenSecret = () => `${base()}:ps`;
const ipSecret = () => `${env().BETTER_AUTH_SECRET ?? "dev-ip-pepper"}:ip`;

export interface FormResult {
  response: Response;
  /** Scoring and delivery. The route runs it after the response (next/server after()). */
  background?: () => Promise<unknown>;
}

const html = (title: string, body: string, status: number, headers: Record<string, string>) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.4rem">${title}</h1><p>${body}</p></body></html>`,
    { status, headers: { ...BASE_HEADERS, ...headers, "content-type": "text/html; charset=utf-8" } },
  );

function fail(json: boolean, status: number, code: string, extra: Record<string, string> = {}): FormResult {
  const message = ERROR_COPY[code] ?? "Something went wrong.";
  if (json) return { response: new Response(JSON.stringify({ success: false, error: code, message }), { status, headers: { ...BASE_HEADERS, ...extra, "content-type": "application/json" } }) };
  return { response: html("This submission was not sent", message, status, extra) };
}

async function limited(db: Db, key: string, rule: Rule) {
  return !(await rateLimit(key, rule, db)).ok;
}

/** POST /f/:key pipeline (docs/ARCHITECTURE.md section 3). Steps return early with a typed error, never a silent drop. */
export async function handleFormPost(db: Db, req: Request, key: string, deps: Deps = {}): Promise<FormResult> {
  const ctype = (req.headers.get("content-type") ?? "").toLowerCase();
  const asJson = wantsJson(req, ctype.includes("application/json") ? "json" : "form");
  try {
    const form = /^[0-9A-Za-z]{22}$/.test(key) ? await db.docs<Form>("forms").findOne({ key }) : null;
    if (!form) return fail(asJson, 404, "unknown_form");
    if (form.status !== "active") return fail(asJson, 403, "form_paused");

    const origin = requestOrigin(req);
    if (!originAllowed(form.allowedOrigins, origin)) {
      await db.docs<Form>("forms").update({ _id: form._id }, { lastBlockedAt: new Date(), lastBlockedOrigin: (origin ?? "none").slice(0, 200) }, { inc: { blockedCount: 1 } });
      await troubleshootBlockedOrigin(db, { ...form, blockedCount: form.blockedCount + 1 }, (origin ?? "none").slice(0, 200), deps).catch((e) => log.warn("troubleshoot_failed", { message: (e as Error).message }));
      return fail(asJson, 403, "domain_mismatch");
    }

    const ipHash = (await hmacSha256Hex(ipSecret(), clientIp(req))).slice(0, 24);
    if ((await limited(db, `ip:${form._id}:${ipHash}`, RULES.formIp)) || (await limited(db, `form:${form._id}`, RULES.formKey)))
      return fail(asJson, 429, "rate_limited", { "retry-after": "60" });

    const { fields: raw, kind } = await parseBody(req);
    const json = asJson || kind === "json";
    const n = normaliseFields(raw);
    if (!Object.keys(n.fields).length && !n.replyTo) return fail(json, 422, "empty_submission");

    if (form.altchaEnabled && !(n.altcha && (await verifyAltcha(n.altcha, db)))) return fail(json, 422, "captcha_failed");

    const now = deps.now?.() ?? new Date();
    const signals: SpamSignal[] = await timeTokenSignals(timeTokenSecret(), form.key, n.psToken, now.getTime());
    if (n.honeypotFilled) signals.push({ name: "honeypot", weight: 1, detail: "hidden field was filled" });
    const ent = await db.getEntitlement(form.orgId);
    const id = uuidv7(now.getTime());
    const sub: Submission = {
      _id: id, orgId: form.orgId, formId: form._id, receivedAt: now, status: n.honeypotFilled ? "quarantined" : "received",
      fields: n.fields, replyTo: n.replyTo, fromName: n.fromName, subject: n.subject, searchText: buildSearchText(n),
      emailLower: n.replyTo, spamScore: n.honeypotFilled ? 1 : 0, signals, scored: false, isTest: false,
      origin: origin?.slice(0, 200), ipHash, ua: req.headers.get("user-agent")?.slice(0, 200), country: req.headers.get("x-vercel-ip-country") ?? undefined,
      purgeAt: new Date(now.getTime() + retentionDays(effectivePlan(ent, now.getTime()).id) * 864e5),
    };
    if (n.honeypotFilled) sub.sortedAt = now;
    // Durability: the submission is stored before the visitor sees success.
    await db.docs<Submission>("submissions").insert(sub);
    await recordEvent(db, { orgId: sub.orgId, submissionId: id, type: "received", at: now });
    let background: FormResult["background"];
    if (n.honeypotFilled) {
      await countSpam(db, sub.orgId, now);
      await recordEvent(db, { orgId: sub.orgId, submissionId: id, type: "sorted", at: now, detail: "quarantined as spam (honeypot)" });
      await checkSpamBurst(db, form, deps).catch((e) => log.warn("spam_burst_failed", { message: (e as Error).message }));
    } else background = () => processSubmission(db, id, deps).catch((e) => log.error("process_failed", { message: (e as Error).message }));

    if (json) return { response: new Response(JSON.stringify({ success: true, id, message: "Submission received" }), { status: 200, headers: { ...BASE_HEADERS, "content-type": "application/json" } }), background };
    const own = new URL(req.url).origin;
    const target = pickRedirect(form, n.redirect, origin, own) ?? `${own}/thanks`;
    return { response: new Response(null, { status: 303, headers: { ...BASE_HEADERS, location: target } }), background };
  } catch (e) {
    if (e instanceof IngestError) return fail(asJson || ctype.includes("json"), e.status, e.code);
    log.error("form_post_failed", { message: (e as Error).message });
    return fail(asJson, 503, "service_unavailable", { "retry-after": "30" });
  }
}
