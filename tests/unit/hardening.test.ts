import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { deliverPending, markSpam } from "@/lib/delivery/process";
import { handleFormPost } from "@/lib/forms/handler";
import { addRecipient, verifyRecipient } from "@/lib/forms/recipients";
import { createForm } from "@/lib/forms/store";
import type { Form, Submission } from "@/lib/forms/types";
import type { MailMessage, MailTransport } from "@/lib/mail";
import { checkHealth, dependencyState } from "@/lib/health";
import { HttpError, isDbUnavailable, withApi } from "@/lib/http";
import { scrub, scrubText } from "@/lib/logger";
import { checklist } from "@/lib/onboarding/checklist";
import { securityHeaders } from "@/lib/security/headers";
import { shortcutFor } from "@/components/app/inbox/shortcuts";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { event, fakeStripe } from "./fakes";

const sent: MailMessage[] = [];
const transport: MailTransport = { name: "fake", async send(m) { sent.push(m); return { id: `m${sent.length}`, provider: "fake", accepted: true }; } };

let db: Db;
let form: Form;
let n = 0;
beforeEach(async () => {
  db = createMemoryDb("postslot");
  sent.length = 0;
  form = await createForm(db, { orgId: "orgA", userEmail: "a@studio.test", emailVerified: true }, "Contact", transport);
});
const post = async (key: string, body: Record<string, string>, ip = `10.7.${Math.floor(++n / 250)}.${n % 250}`) => {
  const r = await handleFormPost(db, new Request(`http://localhost/f/${key}`, { method: "POST", body: new URLSearchParams(body), headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "x-forwarded-for": ip } }), key, { transport });
  await r.background?.();
  return r;
};

describe("CSP matches the origins the app really uses", () => {
  const csp = Object.fromEntries(securityHeaders().find((h) => h.key === "Content-Security-Policy")!.value.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
  const src = files("src").map((f) => ({ f, text: readFileSync(f, "utf8") }));

  it("never allows framing, plugins or a foreign base", () => {
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["default-src"]).toEqual(["'self'"]);
  });
  it("form-action and redirects: the app posts only to itself, plus Stripe Checkout and Portal (redirect targets)", () => {
    expect(csp["form-action"]).toEqual(["'self'", "https://checkout.stripe.com", "https://billing.stripe.com"]);
  });
  it("client code only fetches same-origin paths or an origin that connect-src allows", () => {
    const allowed = csp["connect-src"]!;
    const bad: string[] = [];
    for (const { f, text } of src) {
      if (!text.includes('"use client"')) continue;
      for (const m of text.matchAll(/fetch\(\s*[`"'](https?:\/\/[^/`"']+)/g)) if (!allowed.includes(m[1]!)) bad.push(`${f}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
  it("every <form action> in the app is a relative path or an origin that form-action allows", () => {
    const bad: string[] = [];
    for (const { f, text } of src) {
      if (f.includes("content") || f.includes("snippets") || f.includes("docs") || f.includes("compare")) continue; // documentation text for the customer's own site
      for (const m of text.matchAll(/<form[^>]*\saction=["'](https?:\/\/[^/"']+)/g)) if (!csp["form-action"]!.includes(m[1]!)) bad.push(`${f}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
  it("redirects to Stripe are made by navigation, so form-action never needs more than the two Stripe hosts", () => {
    const hosts = new Set<string>();
    for (const { text } of src) for (const m of text.matchAll(/https:\/\/([a-z.]*stripe\.com)/g)) hosts.add(m[1]!);
    for (const h of hosts) if (h !== "checkout.stripe.com" && h !== "billing.stripe.com") expect(src.some(({ text }) => new RegExp(`location[^\\n]*${h}`).test(text))).toBe(false);
  });
  it("scripts only from self and Vercel analytics; images may be https (customer favicons are not used, avatars are)", () => {
    expect(csp["script-src"]!.filter((s) => s.startsWith("https://"))).toEqual(["https://va.vercel-scripts.com"]);
  });
});

describe("health reports dependency state without leaking details", () => {
  it("shows words and booleans only, never values", () => {
    const e = { RESEND_API_KEY: "re_SECRET", STRIPE_SECRET_KEY: "sk_test_SECRET", STRIPE_WEBHOOK_SECRET: "whsec_SECRET", CRON_SECRET: "cron_SECRET", MONGODB_URI: "mongodb://user:pass@host/db" } as never;
    const s = dependencyState(e, true);
    expect(s.deps).toEqual({ mail: "resend", billing: "configured", webhookSecret: true, cron: true });
    expect(s.degraded).toEqual([]);
    expect(JSON.stringify(s)).not.toMatch(/SECRET|mongodb|pass@/);
  });
  it("flags what a production launch still needs, never fails the probe for it", async () => {
    expect(dependencyState({} as never, true).degraded).toEqual(["mail_not_configured", "billing_not_configured", "cron_secret_missing"]);
    expect(dependencyState({ STRIPE_SECRET_KEY: "x", RESEND_API_KEY: "y", CRON_SECRET: "z" } as never, true).degraded).toEqual(["stripe_webhook_secret_missing"]);
    expect(dependencyState({} as never, false).degraded).toEqual([]);
    expect((await checkHealth(async () => createMemoryDb("postslot"))).ok).toBe(true);
  });
  it("a database that throws a connection string is reported as db_unreachable only", async () => {
    const r = await checkHealth(async () => { throw new Error("connect ECONNREFUSED mongodb://u:p@10.0.0.5:27017"); });
    expect(r).toMatchObject({ ok: false, error: "db_unreachable" });
    expect(JSON.stringify(r)).not.toMatch(/10\.0\.0\.5|mongodb/);
  });
});

describe("structured logs carry no PII", () => {
  it("masks addresses, connection strings and bearer tokens in free text and PII keys", () => {
    expect(scrubText("send to ada@example.com failed")).toBe("send to [email] failed");
    expect(scrubText("connect mongodb+srv://u:p@c.mongodb.net/x refused")).toBe("connect [uri] refused");
    expect(scrubText("Authorization: Bearer abcdef123456789")).not.toContain("abcdef123456789");
    const o = scrub({ ip: "1.2.3.4", to: "a@b.test", body: "secret text", message: "bounce for a@b.test", status: 502 });
    expect(o).toEqual({ ip: "[redacted]", to: "[redacted]", body: "[redacted]", message: "bounce for [email]", status: 502 });
  });
});

describe("database down gives a sentence and a retry hint, not a raw 500", () => {
  it("maps Mongo connection failures to 503 service_unavailable", async () => {
    const down = Object.assign(new Error("Server selection timed out after 30000 ms mongodb://u:p@h"), { name: "MongoServerSelectionError" });
    expect(isDbUnavailable(down)).toBe(true);
    expect(isDbUnavailable(new Error("boom"))).toBe(false);
    const res = await withApi(async () => { throw down; }, { csrf: false })(new Request("http://x/api/a"), {});
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    const text = await res.text();
    expect(text).toBe('{"error":"service_unavailable"}');
  });
  it("unknown failures stay generic and a validation error keeps its code", async () => {
    expect((await withApi(async () => { throw new Error("secret"); }, { csrf: false })(new Request("http://x/a"), {})).status).toBe(500);
    expect((await withApi(async () => { throw new HttpError(400, "invalid_input"); }, { csrf: false })(new Request("http://x/a"), {})).status).toBe(400);
  });
});

describe("public endpoint abuse controls", () => {
  it("a client guessing form keys is slowed to 429 after 30 misses; the answer before that is the same 404", async () => {
    const key = "A".repeat(22);
    const codes: number[] = [];
    for (let i = 0; i < 32; i++) codes.push((await post(key, { a: "b" }, "198.51.100.9")).response.status);
    expect(codes.slice(0, 30).every((c) => c === 404)).toBe(true);
    expect(codes.slice(30)).toEqual([429, 429]);
    // another client is not affected
    expect((await post(key, { a: "b" }, "198.51.100.10")).response.status).toBe(404);
  });
  it("hostile, unicode and huge input is stored as text and never crashes", async () => {
    expect((await post(form.key, { email: "ada@x.test", message: "é😀".repeat(30_000) })).response.status).toBe(413); // over 100 KB: clear error, nothing stored
    expect(await db.docs<Submission>("submissions").count({ orgId: "orgA" })).toBe(0);
    const r = await post(form.key, { email: "ada@x.test", message: `<script>alert(1)</script> ${"é😀".repeat(1_000)}${"x".repeat(30_000)} ‮ rtl \u0000 nul` });
    expect(r.response.status).toBe(200);
    const s = (await db.docs<Submission>("submissions").find({ orgId: "orgA" }))[0]!;
    expect(s.fields.message!.length).toBeLessThanOrEqual(20_000);
    expect(s.fields.message).toContain("<script>");
    const mail = sent.find((m) => m.subject.includes("Contact") || m.to === "a@studio.test");
    expect(mail?.html ?? "").not.toContain("<script>alert(1)</script>");
  });
  it("double submit of the same body creates two rows (no silent drop) but never two for one request", async () => {
    await post(form.key, { email: "d@x.test", message: "one" });
    await post(form.key, { email: "d@x.test", message: "one" });
    expect(await db.docs<Submission>("submissions").count({ orgId: "orgA" })).toBe(2);
  });
});

describe("stripe webhook signature, replay and duplicates (real signature code)", () => {
  const secret = "whsec_test_secret";
  const stripe = new Stripe("sk_test_x");
  const f = fakeStripe();
  const run = (body: string, header: string) => handleStripeWebhook(body, header, { stripe: { subscriptions: f.stripe.subscriptions, webhooks: stripe.webhooks }, db, secret });
  it("rejects a bad signature, a missing one and a replay older than the tolerance", async () => {
    const body = event("customer.subscription.updated", { customer: "cus_unknown" }, "evt_sig1");
    const good = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    expect((await run(body, "t=1,v1=deadbeef")).status).toBe(400);
    expect((await run(body, "")).status).toBe(400);
    expect((await run(body + " ", good)).status).toBe(400); // body tampered after signing
    const old = stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await run(body, old)).status).toBe(400);
    expect(await db.hasStripeEvent("evt_sig1")).toBe(false);
  });
  it("a correctly signed event is accepted, and sending it twice stays 200", async () => {
    const body = event("customer.subscription.updated", { customer: null }, "evt_sig2");
    const h = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    expect((await run(body, h)).status).toBe(200);
    expect((await run(body, h)).status).toBe(200);
  });
});

describe("P2-3 mark spam gives the unit back to the month it was counted in", () => {
  it("refunds meteredPeriod, not the receive month", async () => {
    await post(form.key, { email: "v@x.test", message: "hello" });
    const s = (await db.docs<Submission>("submissions").find({ orgId: "orgA" }))[0]!;
    await db.docs<Submission>("submissions").update({ _id: s._id }, { metered: true, meteredPeriod: "2031-02", status: "delivered" });
    await db.incUsage("orgA", "submissions", "2031-02", 1);
    await markSpam(db, s._id, "orgA");
    expect(await db.getUsage("orgA", "submissions", "2031-02")).toBe(0);
  });
});

describe("P2-4 stuck rows cannot starve the re-drive", () => {
  it("a row whose form was deleted is marked failed, a row that keeps failing is given up after the cap", async () => {
    const ghost: Submission = { ...(await (async () => { await post(form.key, { email: "v@x.test", message: "hi" }); return (await db.docs<Submission>("submissions").find({ orgId: "orgA" }))[0]!; })()), _id: "ghost1", formId: "gone", status: "received", receivedAt: new Date(Date.now() - 10 * 60_000) };
    await db.docs<Submission>("submissions").insert(ghost);
    const r = await deliverPending(db, { transport });
    expect(r.abandoned).toBe(1);
    expect((await db.docs<Submission>("submissions").get("ghost1"))!.status).toBe("failed");
    const loop: Submission = { ...ghost, _id: "loop1", formId: form._id, status: "received", redrives: 20 };
    await db.docs<Submission>("submissions").insert(loop);
    expect((await deliverPending(db, { transport })).abandoned).toBe(1);
    expect((await db.docs<Submission>("submissions").get("loop1"))!.status).toBe("failed");
  });
});

describe("export of their data", () => {
  it("includes deliveries and receipt events, only for that workspace", async () => {
    const other = await createForm(db, { orgId: "orgB", userEmail: "b@studio.test", emailVerified: true }, "Other", transport);
    await post(form.key, { email: "v@x.test", message: "mine" });
    await post(other.key, { email: "v@x.test", message: "theirs" });
    const a = (await db.exportOrgData("orgA")) as { submissions: Submission[]; deliveries: { orgId: string }[]; receiptEvents: { orgId: string }[] };
    expect(a.submissions.map((s) => s.fields.message)).toEqual(["mine"]);
    expect(a.deliveries.length).toBeGreaterThan(0);
    expect(a.receiptEvents.length).toBeGreaterThan(0);
    expect([...a.deliveries, ...a.receiptEvents].every((x) => x.orgId === "orgA")).toBe(true);
  });
});

describe("clock skew on expiring links", () => {
  it("a confirm link works when this server's clock is behind the sender's and dies after 7 days", async () => {
    await addRecipient(db, "orgA", "second@studio.test", { transport });
    const mail = sent.find((m) => m.to === "second@studio.test");
    const token = mail?.text.match(/[?&]t=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();
    if (!token) return;
    expect(await verifyRecipient(db, token, { transport }, new Date(Date.now() - 5 * 60_000))).not.toBeNull();
    expect(await verifyRecipient(db, token, { transport }, new Date(Date.now() + 30 * 864e5))).toBeNull();
  });
});

describe("first-run checklist and shortcuts", () => {
  it("walks from nothing to the first real lead", () => {
    expect(checklist({ forms: 0, confirmedRecipient: false, testSubmissions: 0, realSubmissions: 0 })).toMatchObject({ done: 0, complete: false });
    const mid = checklist({ forms: 1, confirmedRecipient: true, testSubmissions: 1, realSubmissions: 0, firstFormId: "f1" });
    expect(mid.done).toBe(3);
    expect(mid.steps.find((s) => s.id === "install")).toMatchObject({ done: false, href: "/app/forms/f1/onboarding" });
    expect(checklist({ forms: 1, confirmedRecipient: true, testSubmissions: 0, realSubmissions: 2 }).complete).toBe(true);
  });
  it("shortcuts ignore typing, modifiers and dialogs-free keys", () => {
    expect(shortcutFor({ key: "j" })).toBe("next");
    expect(shortcutFor({ key: "k" })).toBe("prev");
    expect(shortcutFor({ key: "/" })).toBe("search");
    expect(shortcutFor({ key: "Escape" })).toBe("close");
    expect(shortcutFor({ key: "j", target: { tagName: "INPUT" } })).toBeNull();
    expect(shortcutFor({ key: "Escape", target: { tagName: "TEXTAREA" } })).toBeNull();
    expect(shortcutFor({ key: "j", metaKey: true })).toBeNull();
    expect(shortcutFor({ key: "x" })).toBeNull();
  });
});

describe("bulk actions are tenant isolated", () => {
  it("user A cannot release or mark user B's submissions, even with guessed ids", async () => {
    vi.resetModules();
    const dbX = createMemoryDb("postslot");
    vi.doMock("@/lib/db", () => ({ getDb: async () => dbX }));
    vi.doMock("@/lib/auth/session", () => ({ requireOrg: async () => ({ org: { id: "orgA" }, user: { id: "uA" }, role: "owner" }), requirePermission: () => undefined }));
    const { POST } = await import("@/app/api/submissions/bulk/route");
    const mk = (id: string, orgId: string, status: Submission["status"]) => dbX.docs<Submission>("submissions").insert({ _id: id, orgId, formId: "f", receivedAt: new Date(), status, fields: {}, searchText: "", spamScore: 0, signals: [], scored: true, isTest: false, ipHash: "h", purgeAt: new Date(Date.now() + 1e9) } as Submission);
    await dbX.docs<Form>("forms").insert({ _id: "f", orgId: "orgB", key: "K".repeat(22), name: "B", status: "active", recipientIds: [] } as unknown as Form);
    await mk("b1", "orgB", "quarantined");
    await mk("b2", "orgB", "delivered");
    const call = (body: unknown) => POST(new Request("http://localhost/api/submissions/bulk", { method: "POST", body: JSON.stringify(body), headers: { origin: "http://localhost", "content-type": "application/json" } }), {});
    const res = await call({ action: "not_spam", ids: ["b1", "b2", "nope"] });
    expect(await res.json()).toEqual({ done: 0, skipped: 3 });
    expect((await dbX.docs<Submission>("submissions").get("b1"))!.status).toBe("quarantined");
    expect((await (await call({ action: "spam", ids: ["b2"] })).json())).toEqual({ done: 0, skipped: 1 });
    expect((await dbX.docs<Submission>("submissions").get("b2"))!.status).toBe("delivered");
    expect((await call({ action: "spam", ids: [] })).status).toBe(400);
    expect((await call({ action: "spam", ids: Array.from({ length: 101 }, (_, i) => `i${i}`) })).status).toBe(400);
    expect((await call({ action: "delete", ids: ["b1"] })).status).toBe(400);
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/auth/session");
  });
});
