import { product } from "@/config/product";
import { effectivePlan, limitFor } from "@/lib/billing/entitlement";
import { periodOf } from "@/lib/billing/usage";
import type { Db } from "@/lib/db/types";
import { verifiedRecipients, type Deps } from "@/lib/delivery/dispatch";
import { appUrl } from "@/lib/env";
import type { Form, Recipient } from "@/lib/forms/types";
import { log } from "@/lib/logger";
import { sendMail, transportFromEnv } from "@/lib/mail";

// Owner emails: usage notices (80% and 100% of the monthly meter), spam burst alerts and the blocked-origin
// troubleshooting email. They go through the Mailer to confirmed addresses only. Every one is deduped.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const wrap = (paras: string[], cta?: { href: string; label: string }) =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1d24;font-size:15px;line-height:1.5;max-width:560px">${paras.map((p) => `<p>${p}</p>`).join("")}${cta ? `<p><a href="${esc(cta.href)}">${esc(cta.label)}</a></p>` : ""}<p style="color:#63666e;font-size:12px">Postslot by BufferSol</p></div>`;

async function sendTo(emails: string[], msg: { subject: string; text: string; html: string; tags: Record<string, string> }, deps: Deps): Promise<number> {
  const transport = deps.transport ?? transportFromEnv();
  let sent = 0;
  for (const to of emails) {
    try {
      await sendMail({ to, ...msg, category: "transactional" }, transport);
      sent++;
    } catch (e) {
      log.warn("owner_mail_failed", { kind: msg.tags.kind, message: (e as Error).message });
    }
  }
  return sent;
}

/** Confirmed addresses for workspace-level notices: sign-in addresses first, else any confirmed recipient. */
export async function ownerEmails(db: Db, orgId: string): Promise<string[]> {
  const rs = (await db.docs<Recipient>("recipients").find({ orgId })).filter((r) => r.verifiedAt && !r.bouncedAt);
  const login = rs.filter((r) => r.source === "login");
  return (login.length ? login : rs).map((r) => r.email);
}

export function usageNoticeMail(percent: number, used: number, limit: number, planName: string) {
  const full = percent >= 100;
  const subject = full ? `You have used all ${limit.toLocaleString("en-US")} submissions this month` : `You have used ${percent}% of this month's submissions`;
  const lines = full
    ? [`Your ${planName} plan includes ${limit.toLocaleString("en-US")} submissions a month and you have used ${used.toLocaleString("en-US")}.`, "New submissions are now held, not dropped. They are released automatically when the month resets or you upgrade. Spam never counts."]
    : [`You have used ${used.toLocaleString("en-US")} of the ${limit.toLocaleString("en-US")} submissions in your ${planName} plan this month.`, "Spam never counts toward this number. If you pass the limit, new submissions are held, not dropped."];
  const href = `${appUrl()}/app/billing`;
  return { subject, text: `${lines.join("\n\n")}\n\nPlans and usage: ${href}`, html: wrap(lines.map(esc), { href, label: "See plans and usage" }) };
}

/** Sends the 80% and 100% notices once per period each. The `usage_notices` insert is the dedupe lock. */
export async function checkUsageNotices(db: Db, orgId: string, deps: Deps = {}): Promise<number[]> {
  const now = deps.now?.() ?? new Date();
  const ent = await db.getEntitlement(orgId);
  const limit = limitFor(ent, "submissions", now.getTime());
  if (limit <= 0) return [];
  const period = periodOf(now);
  const used = await db.getUsage(orgId, "submissions", period);
  const sent: number[] = [];
  for (const percent of product.meter.warnAtPercent) {
    if (used * 100 < percent * limit) continue;
    const fresh = await db.docs<{ _id: string; orgId: string; period: string; percent: number; at: Date }>("usage_notices").insert({ _id: `${orgId}|${period}|${percent}`, orgId, period, percent, at: now });
    if (!fresh) continue;
    const to = await ownerEmails(db, orgId);
    await sendTo(to, { ...usageNoticeMail(percent, used, limit, effectivePlan(ent, now.getTime()).name), tags: { kind: "usage_notice", percent: String(percent) } }, deps);
    sent.push(percent);
  }
  return sent;
}

export const SPAM_BURST = { count: 20, windowMs: 10 * 60_000, cooldownMs: 3600_000 };

/** Call once per quarantined submission. At 20 spam in 10 minutes the owner gets one alert, then at most one an hour. */
export async function checkSpamBurst(db: Db, form: Form, deps: Deps = {}): Promise<boolean> {
  const now = deps.now?.() ?? new Date();
  const hits = await db.hitRateLimit(`spamburst:${form._id}`, SPAM_BURST.windowMs, now.getTime());
  if (hits < SPAM_BURST.count) return false;
  if ((await db.hitRateLimit(`spamburst-mail:${form._id}`, SPAM_BURST.cooldownMs, now.getTime())) > 1) return false;
  const to = (await verifiedRecipients(db, form)).map((r) => r.email);
  const href = `${appUrl()}/app?form=${form._id}&filter=spam`;
  const line = `${form.name} received ${SPAM_BURST.count} or more spam submissions in the last 10 minutes. They were quarantined and do not count toward your quota.`;
  const tip = "If you see real messages in the spam tab, press Not spam on them. To cut the noise, turn on the ALTCHA check or add the posting site to Allowed sites in the form settings.";
  await sendTo(to, { subject: `Spam burst on ${form.name}`, text: `${line}\n\n${tip}\n\nReview: ${href}`, html: wrap([esc(line), esc(tip)], { href, label: "Review the spam tab" }), tags: { kind: "spam_burst", form: form._id } }, deps);
  return true;
}

export const TROUBLESHOOT = { afterRejected: 3, cooldownMs: 24 * 3600_000 };

export function troubleshootMail(form: Pick<Form, "_id" | "name" | "allowedOrigins">, origin: string) {
  const shown = origin === "none" ? "no Origin or Referer header" : origin;
  const allowed = form.allowedOrigins.length ? form.allowedOrigins.join(", ") : "(none)";
  const lines = [
    `${TROUBLESHOOT.afterRejected} submissions to ${form.name} were rejected because they came from a site that is not on the allowed list.`,
    `Rejected source: ${shown}. Allowed sites: ${allowed}.`,
    "If this is your site, add it under Allowed sites in the form settings (the host name is enough, for example yoursite.com or *.yoursite.com). If your form posts from a browser extension, an app or a server, it sends no Origin header: clear the allowed list or post from an allowed site.",
  ];
  const href = `${appUrl()}/app/forms/${form._id}`;
  return { subject: `Your form ${form.name} is rejecting submissions`, text: `${lines.join("\n\n")}\n\nForm settings: ${href}`, html: wrap(lines.map(esc), { href, label: "Open form settings" }) };
}

/** After the 3rd rejected post (and every 3rd after, at most daily) email the confirmed recipients how to fix the allowed list. */
export async function troubleshootBlockedOrigin(db: Db, form: Form, origin: string, deps: Deps = {}): Promise<boolean> {
  const now = deps.now?.() ?? new Date();
  const since = form.blockedCount - (form.troubleshootAtCount ?? 0);
  if (since < TROUBLESHOOT.afterRejected) return false;
  if (form.troubleshootSentAt && now.getTime() - form.troubleshootSentAt.getTime() < TROUBLESHOOT.cooldownMs) return false;
  // Claim first so concurrent rejected posts send a single email.
  const claimed = await db.docs<Form>("forms").update({ _id: form._id, troubleshootAtCount: form.troubleshootAtCount ?? { $exists: false } }, { troubleshootSentAt: now, troubleshootAtCount: form.blockedCount });
  if (!claimed) return false;
  const to = (await verifiedRecipients(db, form)).map((r) => r.email);
  await sendTo(to, { ...troubleshootMail(form, origin), tags: { kind: "troubleshoot_origin", form: form._id } }, deps);
  return true;
}
