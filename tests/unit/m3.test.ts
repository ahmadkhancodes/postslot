import { beforeEach, describe, expect, it } from "vitest";
import { lifetimeEntitlement } from "@/lib/billing/entitlement";
import { periodOf } from "@/lib/billing/usage";
import { createMemoryDb } from "@/lib/db/memory";
import { matchText, parseTextQuery, tokenize } from "@/lib/db/text";
import type { Db } from "@/lib/db/types";
import { applyMailEvent } from "@/lib/delivery/events";
import { dispatchSubmission } from "@/lib/delivery/dispatch";
import { renderNotification, renderSubject, previewNotification, sampleSubmission } from "@/lib/delivery/templates";
import { handleFormPost } from "@/lib/forms/handler";
import { createForm, updateForm } from "@/lib/forms/store";
import type { Form, Submission } from "@/lib/forms/types";
import { listSubmissions } from "@/lib/inbox/query";
import { deleteAllSubmissions, purgeExpired } from "@/lib/inbox/purge";
import { retentionDays } from "@/lib/inbox/retention";
import type { MailMessage, MailTransport } from "@/lib/mail";
import { SPAM_BURST, TROUBLESHOOT, checkSpamBurst, checkUsageNotices } from "@/lib/notices";
import { lintHasErrors, lintSnippet } from "@/lib/onboarding/lint";
import { sendTestSubmission } from "@/lib/onboarding/test-submission";
import { replayDelivery, verifySignature } from "@/lib/webhooks/outbound";
import { SUBMISSION_EVENTS, emitSubmissionEvent, webhooksAllowed } from "@/lib/webhooks/submissions";

const ORG = "org_m3";
let db: Db;
let form: Form;
let sent: MailMessage[];
let tx: MailTransport;
let fetched: { url: string; init: RequestInit }[];
const fetchFn = (async (url: string, init: RequestInit) => { fetched.push({ url, init }); return new Response("ok", { status: 200 }); }) as unknown as typeof fetch;

let n = 0;
const post = (key: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(`http://localhost/f/${key}`, { method: "POST", body: new URLSearchParams(body), headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `11.${Math.floor(++n / 250)}.${n % 250}.1`, ...headers } });
async function submit(body: Record<string, string>, headers: Record<string, string> = {}) {
  const r = await handleFormPost(db, post(form.key, body, headers), form.key, { transport: tx, fetchFn });
  await r.background?.();
  return r;
}
const subs = () => db.docs<Submission>("submissions").find({ orgId: ORG }, { sort: { receivedAt: 1 } });
const upgrade = (plan: "starter" | "pro", org = ORG) => db.setEntitlement(org, lifetimeEntitlement(plan, "pi_t", Date.now()));
const addHook = (events: string[], formId: string | undefined = form._id, id = `ep_${Math.random()}`) =>
  db.createWebhookEndpoint({ id, orgId: ORG, formId, url: "https://hooks.test/in", events, enabled: true, secret: "whsec_test" });

beforeEach(async () => {
  db = createMemoryDb("postslot");
  globalThis.__kitMemoryDb = db;
  sent = [];
  fetched = [];
  tx = { name: "fake", async send(msg) { sent.push(msg); return { id: `m${sent.length}`, provider: "fake", accepted: true }; } };
  form = await createForm(db, { orgId: ORG, userEmail: "owner@studio.test", emailVerified: true }, "Contact", tx);
});

describe("templates", () => {
  const sub = { ...sampleSubmission({ _id: "f", orgId: ORG }), fields: { name: "Mara <b>O</b>", message: "Line 1\nLine 2 & more" } };
  const f = (template?: "default" | "compact" | "plain") => ({ name: "Contact", subjectTemplate: "New message from {{name}}", template });

  it("default, compact and plain differ and every value is escaped", () => {
    const d = renderNotification(f("default"), sub);
    const c = renderNotification(f("compact"), sub);
    const p = renderNotification(f("plain"), sub);
    expect(d.html).toContain("<table");
    expect(d.html).toContain("Mara &lt;b&gt;O&lt;/b&gt;");
    expect(d.html).not.toContain("<b>O</b>");
    expect(c.html).toContain("border:1px solid #e1e2e6");
    expect(c.html).not.toBe(d.html);
    expect(p.html).toBe("");
    for (const r of [d, c, p]) {
      expect(r.text).toContain("name: Mara <b>O</b>"); // text is not HTML: no escaping
      expect(r.text).toContain("message: Line 1\nLine 2 & more");
      expect(r.text).toContain("Reply to this email to answer mara@example.com.");
      expect(r.text.endsWith("Sent with Postslot by BufferSol")).toBe(true);
    }
    expect(p.text).toBe(d.text);
  });

  it("a missing template means default (forms created before M3)", () => {
    expect(renderNotification(f(undefined), sub)).toEqual(renderNotification(f("default"), sub));
  });

  it("subject variables: fields, {{form}}, missing = empty, control characters stripped, posted subject wins", () => {
    expect(renderSubject("Hi {{name}} via {{form}} {{nope}}!", { name: "Contact" }, { fields: { name: "Ada\r\nBcc: x@evil.test" } })).toBe("Hi Ada Bcc: x@evil.test via Contact !");
    expect(renderSubject("{{missing}}", { name: "Contact" }, { fields: {} })).toBe("New submission on Contact");
    expect(renderSubject("T {{name}}", { name: "C" }, { fields: { name: "x" }, subject: "Posted" })).toBe("Posted");
    expect(renderNotification(f("plain"), sub).subject).toBe("New message from Mara <b>O</b>");
  });

  it("test submissions are labelled in subject, text and html", () => {
    const t = { ...sub, isTest: true };
    expect(renderNotification(f("default"), t).subject.startsWith("[Test] ")).toBe(true);
    expect(renderNotification(f("default"), t).html).toContain("not counted on your meter");
    expect(renderNotification(f("plain"), t).text.startsWith("This is a test submission")).toBe(true);
  });

  it.each(["default", "compact", "plain"] as const)("preview equals what is sent (%s)", async (template) => {
    await updateForm(db, ORG, form._id, { template, subjectTemplate: "Hello {{name}}" });
    const live = (await db.docs<Form>("forms").get(form._id))!;
    const sample = sampleSubmission(live);
    await db.docs<Submission>("submissions").insert({ ...sample, _id: "s_sample", status: "sorted" });
    await dispatchSubmission(db, live, { ...sample, _id: "s_sample", status: "sorted" }, { transport: tx });
    const preview = previewNotification(live);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ subject: preview.subject, text: preview.text });
    expect(sent[0]!.html ?? "").toBe(preview.html);
    expect(preview.subject).toBe("Hello Mara Okafor");
  });
});

describe("outbound webhooks", () => {
  it("are plan gated: Free has none, Starter and above do (integrations meter in product.ts)", async () => {
    expect(await webhooksAllowed(db, ORG)).toBe(false);
    await upgrade("starter");
    expect(await webhooksAllowed(db, ORG)).toBe(true);
  });

  it("Free plan: no delivery is attempted even with an endpoint present", async () => {
    await addHook(["submission.received"]);
    await submit({ email: "a@b.co", message: "hi" });
    expect(fetched).toHaveLength(0);
  });

  it("Starter: submission.received is POSTed signed with HMAC-SHA256 and logged", async () => {
    await upgrade("starter");
    await addHook(["submission.received"]);
    await submit({ email: "ada@visitor.test", message: "hello" });
    expect(fetched).toHaveLength(1);
    const { init } = fetched[0]!;
    const body = init.body as string;
    const h = init.headers as Record<string, string>;
    expect(h["x-webhook-event"]).toBe("submission.received");
    expect(await verifySignature("whsec_test", body, h["x-webhook-signature"]!)).toBe(true);
    expect(await verifySignature("wrong", body, h["x-webhook-signature"]!)).toBe(false);
    const payload = JSON.parse(body);
    expect(payload).toMatchObject({ type: "submission.received", data: { form: { id: form._id }, submission: { fields: { message: "hello" }, replyTo: "ada@visitor.test" } } });
    const log = await db.listDeliveries(ORG);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ status: "succeeded", event: "submission.received" });
  });

  it("delivered and bounced fire on the status change only; endpoints are scoped to their form and subscribed events", async () => {
    await upgrade("starter");
    const other = await createForm(db, { orgId: ORG, userEmail: "owner@studio.test", emailVerified: true }, "Other", tx);
    await addHook(["submission.delivered", "submission.bounced"]);
    await addHook(["submission.delivered"], other._id);
    await addHook(["submission.held"]);
    await submit({ email: "a@b.co", message: "hi" });
    expect(fetched).toHaveLength(0);
    const [s] = await subs();
    const at = new Date(Date.now() + 5000);
    await applyMailEvent(db, { id: "ev1", messageId: "m1", type: "accepted", at }, { fetchFn });
    await applyMailEvent(db, { id: "ev1", messageId: "m1", type: "accepted", at }, { fetchFn }); // duplicate provider event
    expect(fetched.map((c) => (c.init.headers as Record<string, string>)["x-webhook-event"])).toEqual(["submission.delivered"]);
    expect(JSON.parse(fetched[0]!.init.body as string).data.submission).toMatchObject({ id: s!._id, status: "delivered" });
    expect(JSON.parse(fetched[0]!.init.body as string).data.submission.fields).toBeUndefined();
  });

  it("bounce: a hard return fires submission.bounced", async () => {
    await upgrade("starter");
    await addHook(["submission.bounced"]);
    await submit({ email: "a@b.co", message: "hi" });
    await applyMailEvent(db, { id: "b1", messageId: "m1", type: "returned", classification: "hard", at: new Date(Date.now() + 5000), recipient: "owner@studio.test" }, { fetchFn });
    expect(fetched).toHaveLength(1);
    expect(JSON.parse(fetched[0]!.init.body as string).type).toBe("submission.bounced");
  });

  it("held fires once, even when the cron retries the held row", async () => {
    await upgrade("starter");
    await addHook(["submission.held"]);
    await db.incUsage(ORG, "submissions", periodOf(), 5000);
    await submit({ email: "a@b.co", message: "over" });
    const [s] = await subs();
    expect(s!.status).toBe("held");
    expect(fetched).toHaveLength(1);
    const { deliverPending } = await import("@/lib/delivery/process");
    await deliverPending(db, { transport: tx, fetchFn });
    await deliverPending(db, { transport: tx, fetchFn });
    expect(fetched).toHaveLength(1);
    expect(JSON.parse(fetched[0]!.init.body as string).data.submission.holdReason).toBe("over_limit");
  });

  it("a failing endpoint never breaks ingest, and replay re-sends the logged event with a new id", async () => {
    await upgrade("starter");
    await addHook(["submission.received"]);
    const bad = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    const f = (await db.docs<Form>("forms").get(form._id))!;
    const sub = sampleSubmission(f);
    expect(await emitSubmissionEvent(db, f, sub, "submission.received", { fetchFn: bad })).toBe(1);
    const [d] = await db.listDeliveries(ORG);
    expect(d).toMatchObject({ status: "retrying", lastError: "network_error" });
    const r = await replayDelivery(ORG, d!.id, { db, fetchFn });
    expect(r).toMatchObject({ status: "succeeded", event: "submission.received" });
    expect(r!.id).not.toBe(d!.id);
    expect(JSON.parse(r!.payload)).toMatchObject({ replayOf: d!.id });
    expect(await replayDelivery(ORG, "nope", { db, fetchFn })).toBeNull();
  });

  it("the four events are the documented set", () => {
    expect([...SUBMISSION_EVENTS]).toEqual(["submission.received", "submission.delivered", "submission.bounced", "submission.held"]);
  });
});

describe("field linter", () => {
  const rules = (html: string, endpoint?: string) => lintSnippet(html, { endpoint }).map((i) => i.rule).sort();
  const EP = "https://postslot.test/f/AbCdEfGhIjKlMnOpQrStUv";
  const good = `<form action="${EP}" method="POST"><input name="email" type="email"><textarea name="message"></textarea><input type="text" name="_gotcha" style="display:none"><button type="submit">Send</button></form>`;

  it("a correct form has no issues", () => expect(lintSnippet(good, { endpoint: EP })).toEqual([]));
  it("no form tag", () => { expect(rules("<div>hi</div>")).toEqual(["no_form"]); expect(lintHasErrors(lintSnippet("<div/>"))).toBe(true); });
  it("missing action, missing or GET method", () => {
    expect(rules(good.replace(`action="${EP}" `, ""))).toContain("no_action");
    expect(rules(good.replace(' method="POST"', ""))).toContain("get_method");
    expect(rules(good.replace("POST", "get"))).toContain("get_method");
  });
  it("action pointing somewhere else", () => {
    expect(rules(good.replace(EP, "https://formspree.io/f/xyz"), EP)).toContain("wrong_action");
    expect(rules(good.replace(EP, "/contact"))).toContain("wrong_action");
  });
  it("fields without a name, by tag and label", () => {
    const issues = lintSnippet(`<form action="${EP}" method="post"><input id="mail" type="email"><textarea placeholder="Tell us"></textarea><select></select><input type="submit"></form>`);
    expect(issues.filter((i) => i.rule === "missing_name").map((i) => i.message.split(" has")[0])).toEqual(["#mail", '"Tell us"', "<select>"]);
  });
  it("buttons and submit inputs need no name", () => expect(rules(good.replace("<button", '<input type="reset"><button'))).toEqual([]));
  it("no honeypot, and a visible honeypot", () => {
    expect(rules(good.replace(/<input type="text" name="_gotcha"[^>]*>/, ""))).toEqual(["no_honeypot"]);
    expect(lintSnippet(good.replace(' style="display:none"', "")).find((i) => i.rule === "no_honeypot")?.message).toContain("visible");
  });
  it("file inputs, duplicate names, special names, no email field, no submit", () => {
    expect(rules(good.replace("<button", '<input type="file" name="cv"><button'))).toEqual(["file_input"]);
    expect(rules(good.replace("<button", '<input name="topic"><input name="topic"><button'))).toEqual(["duplicate_name"]);
    expect(rules(good.replace('name="message"', 'name="subject"'))).toEqual(["special_name_clash"]);
    expect(rules(good.replace('name="email"', 'name="mail"'))).toEqual(["no_email_field"]);
    expect(rules(good.replace(/<button.*<\/button>/, ""))).toEqual(["no_submit"]);
  });
  it("more than 25 fields", () => {
    const many = Array.from({ length: 26 }, (_, i) => `<input name="f${i}">`).join("");
    expect(rules(`<form action="${EP}" method="POST">${many}<input name="email"><input name="_gotcha" hidden><button>Go</button></form>`)).toEqual(["too_many_fields"]);
  });
  it("ignores commented-out HTML and understands JSX expressions", () => {
    expect(rules(`<!-- <form> -->${good}`)).toEqual([]);
    expect(rules(`<form action={url} method={"POST"}><input name={n} /><input name="email" /><input name="_gotcha" style={{display:"none"}} /><button>Go</button></form>`)).toEqual([]);
  });
});

describe("owner notices", () => {
  const notices = () => sent.filter((m) => m.tags?.kind === "usage_notice");

  it("usage notices: 80% once, 100% once, nothing repeated in the same period, again next period", async () => {
    const now = new Date("2026-03-10T10:00:00Z");
    const deps = { transport: tx, now: () => now };
    await db.incUsage(ORG, "submissions", "2026-03", 199);
    expect(await checkUsageNotices(db, ORG, deps)).toEqual([]);
    await db.incUsage(ORG, "submissions", "2026-03", 1); // 200 of 250 = 80%
    expect(await checkUsageNotices(db, ORG, deps)).toEqual([80]);
    expect(await checkUsageNotices(db, ORG, deps)).toEqual([]);
    await db.incUsage(ORG, "submissions", "2026-03", 50); // 250 = 100%
    expect(await checkUsageNotices(db, ORG, deps)).toEqual([100]);
    expect(await checkUsageNotices(db, ORG, deps)).toEqual([]);
    expect(notices().map((m) => m.tags?.percent)).toEqual(["80", "100"]);
    expect(notices()[0]).toMatchObject({ to: "owner@studio.test" });
    expect(notices()[1]!.text).toContain("held, not dropped");
    const next = new Date("2026-04-02T10:00:00Z");
    await db.incUsage(ORG, "submissions", "2026-04", 250);
    expect(await checkUsageNotices(db, ORG, { transport: tx, now: () => next })).toEqual([80, 100]);
  });

  it("jumping straight past 100% sends both notices once", async () => {
    await db.incUsage(ORG, "submissions", periodOf(), 300);
    expect(await checkUsageNotices(db, ORG, { transport: tx })).toEqual([80, 100]);
    expect(await checkUsageNotices(db, ORG, { transport: tx })).toEqual([]);
  });

  it("the ingest pipeline sends the notice when a real submission reaches 80%, test submissions never do", async () => {
    await db.incUsage(ORG, "submissions", periodOf(), 198);
    await sendTestSubmission(db, form, { email: "owner@studio.test" }, { transport: tx });
    expect(notices()).toHaveLength(0);
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(198); // tests are not metered
    await submit({ email: "a@b.co", message: "real" });
    await submit({ email: "c@d.co", message: "real 2" });
    expect(notices().map((m) => m.tags?.percent)).toEqual(["80"]);
  });

  it("spam burst alert: one email at the 20th spam in 10 minutes, then at most one an hour", async () => {
    const f = (await db.docs<Form>("forms").get(form._id))!;
    const t0 = new Date("2026-03-10T10:00:00Z").getTime();
    const mails = () => sent.filter((m) => m.tags?.kind === "spam_burst");
    for (let i = 0; i < SPAM_BURST.count - 1; i++) expect(await checkSpamBurst(db, f, { transport: tx, now: () => new Date(t0 + i * 1000) })).toBe(false);
    expect(await checkSpamBurst(db, f, { transport: tx, now: () => new Date(t0 + 30_000) })).toBe(true);
    expect(mails()).toHaveLength(1);
    expect(mails()[0]).toMatchObject({ to: "owner@studio.test" });
    for (let i = 0; i < 30; i++) expect(await checkSpamBurst(db, f, { transport: tx, now: () => new Date(t0 + 60_000 + i * 1000) })).toBe(false);
    expect(mails()).toHaveLength(1);
    // Slow spam never alerts: one an hour is under the threshold.
    const slow = await createForm(db, { orgId: ORG, userEmail: "owner@studio.test", emailVerified: true }, "Slow", tx);
    for (let i = 0; i < 40; i++) expect(await checkSpamBurst(db, slow, { transport: tx, now: () => new Date(t0 + i * 3600_000) })).toBe(false);
  });

  it("honeypot spam from the endpoint feeds the burst alert", async () => {
    for (let i = 0; i < SPAM_BURST.count; i++) await handleFormPost(db, post(form.key, { m: "x", _gotcha: "bot" }, { "x-forwarded-for": `3.3.3.${i}` }), form.key, { transport: tx });
    expect(sent.filter((m) => m.tags?.kind === "spam_burst")).toHaveLength(1);
    expect(sent.some((m) => m.tags?.kind === "usage_notice")).toBe(false); // spam never counts
  });

  it("troubleshooting email after 3 rejected posts from a blocked origin, once per day", async () => {
    await updateForm(db, ORG, form._id, { allowedOrigins: ["site.test"] });
    const bad = () => submit({ m: "x" }, { origin: "https://evil.test" });
    const mails = () => sent.filter((m) => m.tags?.kind === "troubleshoot_origin");
    expect((await bad()).response.status).toBe(403);
    await bad();
    expect(mails()).toHaveLength(0);
    await bad();
    expect(mails()).toHaveLength(1);
    expect(mails()[0]).toMatchObject({ to: "owner@studio.test" });
    expect(mails()[0]!.text).toContain("https://evil.test");
    expect(mails()[0]!.text).toContain("site.test");
    for (let i = 0; i < TROUBLESHOOT.afterRejected * 2; i++) await bad();
    expect(mails()).toHaveLength(1); // inside the 24 hour cooldown
    expect((await db.docs<Form>("forms").get(form._id))!.troubleshootAtCount).toBe(3);
  });

  it("a form with an allowed origin that posts correctly never triggers the troubleshooting email", async () => {
    await updateForm(db, ORG, form._id, { allowedOrigins: ["site.test"] });
    for (let i = 0; i < 4; i++) await submit({ m: `ok${i}` }, { origin: "https://site.test" });
    expect(sent.some((m) => m.tags?.kind === "troubleshoot_origin")).toBe(false);
  });
});

describe("test submission", () => {
  it("is labelled, delivered, returns a receipt and is not metered", async () => {
    const r = await sendTestSubmission(db, form, { email: "owner@studio.test" }, { transport: tx });
    expect(r.steps.map((s) => s.label)).toEqual(["Received", "Sorted", "Dispatched"]);
    expect(r.deliveries).toEqual([{ email: "owner@studio.test", status: "queued" }].map((d) => ({ ...d, status: r.deliveries[0]!.status })));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject.startsWith("[Test] ")).toBe(true);
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(0);
    const [s] = await subs();
    expect(s).toMatchObject({ isTest: true });
  });
});

describe("retention purge", () => {
  const old = async (orgId: string, formId: string, daysAgo: number, id: string, purgeDays: number) => {
    const receivedAt = new Date(Date.now() - daysAgo * 864e5);
    const base = sampleSubmission({ _id: formId, orgId });
    await db.docs<Submission>("submissions").insert({ ...base, _id: id, orgId, formId, receivedAt, purgeAt: new Date(receivedAt.getTime() + purgeDays * 864e5) });
    await db.docs("deliveries").insert({ _id: `d_${id}`, orgId, submissionId: id } as never);
    await db.docs("delivery_events").insert({ _id: `e_${id}`, orgId, submissionId: id } as never);
  };

  it("plan retention comes from product.ts", () => {
    expect([retentionDays("free"), retentionDays("starter"), retentionDays("pro"), retentionDays("agency")]).toEqual([90, 180, 365, 365]);
  });

  it("deletes past-retention rows with their deliveries and receipts, keeps the rest, writes one audit entry per workspace", async () => {
    await old(ORG, form._id, 120, "gone1", 90);
    await old(ORG, form._id, 100, "gone2", 90);
    await old(ORG, form._id, 10, "stay", 90);
    const r = await purgeExpired(db);
    expect(r).toMatchObject({ deleted: 2, kept: 0, orgs: 1 });
    expect((await subs()).map((s) => s._id)).toEqual(["stay"]);
    expect(await db.docs("deliveries").count({ orgId: ORG })).toBe(1);
    expect(await db.docs("delivery_events").count({ orgId: ORG })).toBe(1);
    const audit = await db.listAudit(ORG);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "retention.purged", meta: { deleted: 2, retentionDays: 90 } });
    expect(await purgeExpired(db)).toMatchObject({ deleted: 0, orgs: 0 }); // idempotent, no empty audit entries
    expect(await db.listAudit(ORG)).toHaveLength(1);
  });

  it("a workspace that upgraded keeps rows stamped under the old plan (re-stamped, not deleted)", async () => {
    await upgrade("starter"); // 180 days
    await old(ORG, form._id, 120, "kept", 90);
    await old(ORG, form._id, 200, "gone", 90);
    const r = await purgeExpired(db);
    expect(r).toMatchObject({ deleted: 1, kept: 1 });
    const kept = (await db.docs<Submission>("submissions").get("kept"))!;
    expect(kept.purgeAt!.getTime()).toBeGreaterThan(Date.now());
    expect((await db.listAudit(ORG))[0]!.meta).toMatchObject({ deleted: 1, retentionDays: 180 });
  });

  it("works in batches across workspaces", async () => {
    const other = await createForm(db, { orgId: "org_other", userEmail: "x@y.test", emailVerified: true }, "Other", tx);
    for (let i = 0; i < 7; i++) await old(i % 2 ? "org_other" : ORG, i % 2 ? other._id : form._id, 200, `b${i}`, 90);
    expect(await purgeExpired(db, new Date(), { batch: 3 })).toMatchObject({ deleted: 7, orgs: 2 });
    expect(await db.docs("submissions").count({})).toBe(0);
    expect(await db.listAudit("org_other")).toHaveLength(1);
  });

  it("delete all submissions removes the form's rows, spam and held included, not other forms', and audits", async () => {
    const other = await createForm(db, { orgId: ORG, userEmail: "owner@studio.test", emailVerified: true }, "Other", tx);
    await old(ORG, form._id, 1, "a", 90);
    await old(ORG, form._id, 2, "b", 90);
    await old(ORG, other._id, 1, "c", 90);
    await db.docs<Submission>("submissions").update({ _id: "b" }, { status: "quarantined" });
    expect(await deleteAllSubmissions(db, ORG, form._id, "user_1")).toBe(2);
    expect((await subs()).map((s) => s._id)).toEqual(["c"]);
    expect(await db.docs("deliveries").count({})).toBe(1);
    expect((await db.listAudit(ORG))[0]).toMatchObject({ action: "form.submissions_deleted", actorId: "user_1", target: form._id, meta: { deleted: 2 } });
  });
});

describe("search", () => {
  it("tokenises on non letters and digits, case-insensitive", () => {
    expect(tokenize("Mara.Okafor@Visitor-Test.com, 3 Rue d'Été")).toEqual(["mara", "okafor", "visitor", "test", "com", "3", "rue", "d", "été"]);
  });
  it("query grammar: words OR, quoted phrases required, minus excludes", () => {
    expect(parseTextQuery('rebrand "new site" -spam')).toEqual({ terms: ["rebrand"], phrases: [["new", "site"]], not: ["spam"] });
    const doc = {};
    const hit = (text: string, q: string) => matchText(doc, text, q);
    expect(hit("Quote a rebrand please", "REBRAND")).toBe(true);
    expect(hit("Quote a rebrand please", "logo rebrand")).toBe(true); // OR
    expect(hit("Quote a rebrand please", "logo")).toBe(false);
    expect(hit("Quote a rebrand please", "reb")).toBe(false); // whole words, like the Mongo text index
    expect(hit("a new site for us", '"new site"')).toBe(true);
    expect(hit("a site that is new", '"new site"')).toBe(false);
    expect(hit("rebrand and spam", "rebrand -spam")).toBe(false);
    expect(hit("rebrand", "-spam")).toBe(false); // nothing positive to match
    expect(hit("mara@visitor.test", "visitor.test")).toBe(true);
    expect(hit("x", "")).toBe(false);
  });
  it("cache follows edits to the stored text", async () => {
    const store = db.docs<{ _id: string; orgId: string; searchText: string }>("t");
    await store.insert({ _id: "1", orgId: "o", searchText: "alpha" });
    expect(await store.count({ orgId: "o", searchText: { $text: "alpha" } })).toBe(1);
    await store.update({ _id: "1" }, { searchText: "beta" });
    expect(await store.count({ orgId: "o", searchText: { $text: "alpha" } })).toBe(0);
    expect(await store.count({ orgId: "o", searchText: { $text: "beta" } })).toBe(1);
  });
  it("inbox search uses the text filter, scoped to the workspace", async () => {
    await submit({ email: "mara@visitor.test", name: "Mara Okafor", message: "Could you quote a rebrand?" });
    await submit({ email: "tom@visitor.test", name: "Tom Reyes", message: "Taking new work in March?" });
    const q = async (text: string) => (await listSubmissions(db, ORG, { q: text })).map((s) => s.fields.name);
    expect(await q("rebrand")).toEqual(["Mara Okafor"]);
    expect(await q("MARCH okafor")).toEqual(expect.arrayContaining(["Mara Okafor", "Tom Reyes"]));
    expect(await q('"new work"')).toEqual(["Tom Reyes"]);
    expect(await q("nothing")).toEqual([]);
    expect((await listSubmissions(db, "other_org", { q: "rebrand" })).length).toBe(0);
  });
});
