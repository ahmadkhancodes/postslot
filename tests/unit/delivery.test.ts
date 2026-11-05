import { beforeEach, describe, expect, it } from "vitest";
import { NONE } from "@/lib/billing/entitlement";
import { periodOf } from "@/lib/billing/usage";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { applyMailEvent } from "@/lib/delivery/events";
import { BACKOFF_MS, MAX_ATTEMPTS } from "@/lib/delivery/dispatch";
import { deliverPending, markSpam, processSubmission, redeliver, releaseHeld, releaseSubmission, unsuppressRecipient } from "@/lib/delivery/process";
import { renderNotification, renderSubject } from "@/lib/delivery/templates";
import { timelineOpen, timelineSteps } from "@/lib/delivery/timeline";
import { handleFormPost } from "@/lib/forms/handler";
import { addRecipient, sendVerification, verifyRecipient } from "@/lib/forms/recipients";
import { createForm, ensureRecipient, updateForm } from "@/lib/forms/store";
import type { Delivery, Form, Recipient, Submission } from "@/lib/forms/types";
import { toCsv, csvCell } from "@/lib/inbox/export";
import { getDetail, listSubmissions } from "@/lib/inbox/query";
import type { MailMessage, MailTransport } from "@/lib/mail";
import { mapResendEvent, resendEventSource, verifySvix } from "@/lib/mail/events";

function fakeTransport(opts: { fail?: () => boolean; provider?: string } = {}) {
  const sent: (MailMessage & { id: string })[] = [];
  const t: MailTransport = {
    name: opts.provider ?? "fake",
    async send(msg) {
      if (opts.fail?.()) throw new Error("provider_down");
      const id = `msg_${sent.length + 1}`;
      sent.push({ ...msg, id });
      return { id, provider: opts.provider ?? "fake", accepted: true };
    },
  };
  return { t, sent };
}

let n = 0;
const post = (key: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(`http://localhost/f/${key}`, {
    method: "POST",
    body: new URLSearchParams(body),
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `10.0.${Math.floor(++n / 250)}.${n % 250}`, ...headers },
  });

const ORG = "org_1";
let db: Db;
let form: Form;
let tx: ReturnType<typeof fakeTransport>;

async function submit(body: Record<string, string>, headers: Record<string, string> = {}) {
  const r = await handleFormPost(db, post(form.key, { ...body }, headers), form.key, { transport: tx.t });
  await r.background?.();
  return r;
}
const allSubs = () => db.docs<Submission>("submissions").find({ orgId: ORG }, { sort: { receivedAt: 1 } });

beforeEach(async () => {
  db = createMemoryDb("postslot");
  tx = fakeTransport();
  form = await createForm(db, { orgId: ORG, userEmail: "owner@studio.test", emailVerified: true }, "Contact", tx.t);
});

describe("POST /f/:key", () => {
  it("HTML post: stores, 303 to the default thank-you page, delivers with Reply-To, receipt has the stamps", async () => {
    const r = await submit({ email: "ada@visitor.test", message: "Hello there" });
    expect(r.response.status).toBe(303);
    expect(r.response.headers.get("location")).toBe("http://localhost/thanks");
    expect(r.response.headers.get("access-control-allow-origin")).toBe("*");
    expect(tx.sent).toHaveLength(1);
    expect(tx.sent[0]).toMatchObject({ to: "owner@studio.test", replyTo: "ada@visitor.test" });
    expect(tx.sent[0]!.text).toContain("message: Hello there");
    const [sub] = await allSubs();
    expect(sub!.status).toBe("dispatched");
    await applyMailEvent(db, { id: "e1", messageId: "msg_1", type: "accepted", at: new Date(Date.now() + 5000) });
    const d = await getDetail(db, ORG, sub!._id);
    expect(d!.submission.status).toBe("delivered");
    expect(d!.steps.map((s) => s.label)).toEqual(["Received", "Sorted", "Dispatched", "Accepted"]);
  });

  it("JSON/fetch post: 200 {success,id,message} with CORS; redirect field only honoured when allowed", async () => {
    const r = await handleFormPost(db, new Request(`http://localhost/f/${form.key}`, { method: "POST", body: JSON.stringify({ email: "a@b.co", message: "x" }), headers: { "content-type": "application/json", accept: "application/json", origin: "https://site.test", "x-forwarded-for": "9.9.9.9" } }), form.key, { transport: tx.t });
    expect(r.response.status).toBe(200);
    expect(await r.response.json()).toMatchObject({ success: true, message: "Submission received" });
    await updateForm(db, ORG, form._id, { redirectUrl: "https://owner.test/ok" });
    form = (await db.docs<Form>("forms").get(form._id))!;
    const h = await submit({ message: "m", redirect: "https://evil.test/" });
    expect(h.response.headers.get("location")).toBe("https://owner.test/ok");
  });

  it("typed errors: unknown form 404, paused 403, domain mismatch 403 logged, empty 422, 413", async () => {
    const json = (key: string, body: string, h: Record<string, string> = {}) =>
      handleFormPost(db, new Request(`http://localhost/f/${key}`, { method: "POST", body, headers: { "content-type": "application/json", "x-forwarded-for": `7.7.${++n}.1`, ...h } }), key, { transport: tx.t });
    expect((await json("a".repeat(22), "{}")).response.status).toBe(404);
    expect((await json("short", "{}")).response.status).toBe(404);
    expect((await json(form.key, "{}")).response.status).toBe(422);
    expect((await json(form.key, JSON.stringify({ m: "x".repeat(60_000), n: "x".repeat(60_000) }))).response.status).toBe(413);
    await updateForm(db, ORG, form._id, { allowedOrigins: ["site.test"] });
    const bad = await json(form.key, '{"m":"x"}', { origin: "https://evil.test" });
    expect(bad.response.status).toBe(403);
    expect(await bad.response.json()).toMatchObject({ error: "domain_mismatch" });
    expect((await db.docs<Form>("forms").get(form._id))!.blockedCount).toBe(1);
    expect((await json(form.key, '{"m":"x"}', { origin: "https://site.test" })).response.status).toBe(200);
    await updateForm(db, ORG, form._id, { status: "paused" });
    expect((await json(form.key, '{"m":"x"}', { origin: "https://site.test" })).response.status).toBe(403);
    expect(await allSubs()).toHaveLength(1);
  });

  it("HTML errors are a readable page, not a silent drop", async () => {
    const r = await handleFormPost(db, new Request("http://localhost/f/" + "z".repeat(22), { method: "POST", body: "a=b", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" } }), "z".repeat(22));
    expect(r.response.status).toBe(404);
    expect(await r.response.text()).toContain("This form does not exist");
  });

  it("rate limits: the 6th post per minute from one IP is 429 with Retry-After", async () => {
    const ip = { "x-forwarded-for": "5.5.5.5" };
    for (let i = 0; i < 5; i++) expect((await submit({ message: `m${i}` }, ip)).response.status).toBe(303);
    const r = await submit({ message: "m6" }, ip);
    expect(r.response.status).toBe(429);
    expect(r.response.headers.get("retry-after")).toBe("60");
  });

  it("honeypot: same success shape, quarantined, never emailed, never on the quota meter", async () => {
    const ok = await submit({ message: "real" });
    const bot = await submit({ message: "buy", _gotcha: "i am a bot" });
    expect(bot.response.status).toBe(ok.response.status);
    expect(bot.response.headers.get("location")).toBe(ok.response.headers.get("location"));
    const subs = await allSubs();
    expect(subs.find((s) => s.fields.message === "buy")).toMatchObject({ status: "quarantined", signals: [{ name: "honeypot" }] });
    expect(tx.sent).toHaveLength(1);
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(1);
    expect(await db.getUsage(ORG, "spam", periodOf())).toBe(1);
  });

  it("content spam is quarantined with its signals and does not count; a link-stuffed disposable sender trips the rules", async () => {
    await submit({ email: "x@mailinator.com", message: "http://a.test http://b.test http://c.test win" });
    const [s] = await allSubs();
    expect(s).toMatchObject({ status: "quarantined", scored: true });
    expect(s!.signals.map((x) => x.name)).toEqual(expect.arrayContaining(["links", "disposable_email"]));
    expect(tx.sent).toHaveLength(0);
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(0);
    expect(await db.getUsage(ORG, "spam", periodOf())).toBe(1);
  });

  it("a fresh ps_token passes; a too-fast one adds a signal; ALTCHA is required when enabled", async () => {
    const { issueTimeToken } = await import("@/lib/spam/timetoken");
    const { timeTokenSecret } = await import("@/lib/forms/handler");
    await submit({ message: "fast", ps_token: await issueTimeToken(timeTokenSecret(), form.key) });
    expect((await allSubs())[0]!.signals.map((s) => s.name)).toContain("too_fast");
    await updateForm(db, ORG, form._id, { altchaEnabled: true });
    const r = await handleFormPost(db, new Request(`http://localhost/f/${form.key}`, { method: "POST", body: JSON.stringify({ message: "x" }), headers: { "content-type": "application/json", "x-forwarded-for": "3.3.3.3" } }), form.key);
    expect(r.response.status).toBe(422);
    expect(await r.response.json()).toMatchObject({ error: "captcha_failed" });
  });
});

describe("recipient verification", () => {
  it("an unverified recipient gets only the verification mail; submissions wait and go out on confirmation", async () => {
    const r = (await addRecipient(db, ORG, "boss@studio.test", { transport: tx.t }))!;
    await db.docs<Form>("forms").update({ _id: form._id }, { recipientIds: [r._id] });
    form = (await db.docs<Form>("forms").get(form._id))!;
    expect(tx.sent.map((m) => m.to)).toEqual(["boss@studio.test"]);
    expect(tx.sent[0]!.subject).toMatch(/Confirm/);
    expect(tx.sent[0]!.text).not.toContain("message");

    await submit({ email: "v@visitor.test", message: "secret content" });
    const [s] = await allSubs();
    expect(s).toMatchObject({ status: "held", holdReason: "recipient_unverified" });
    expect(tx.sent).toHaveLength(1); // still only the verification email
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(1); // counted once, not twice later

    const token = /t=([\w-]+)/.exec(tx.sent[0]!.text)![1]!;
    expect(await verifyRecipient(db, "wrong-token-value")).toBeNull();
    expect(await verifyRecipient(db, token, { transport: tx.t })).toEqual({ email: "boss@studio.test", released: 1 });
    expect(tx.sent.at(-1)).toMatchObject({ to: "boss@studio.test", replyTo: "v@visitor.test" });
    expect((await db.docs<Submission>("submissions").get(s!._id))!.status).toBe("dispatched");
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(1);
  });

  it("resend is throttled to once a minute; tokens expire after 7 days; the session user's own address is pre-verified", async () => {
    const r = (await addRecipient(db, ORG, "late@studio.test", { transport: tx.t, now: new Date(1_000_000) }))!;
    expect(await sendVerification(db, (await db.docs<Recipient>("recipients").get(r._id))!, tx.t, new Date(1_030_000))).toBe(false);
    expect(await sendVerification(db, (await db.docs<Recipient>("recipients").get(r._id))!, tx.t, new Date(1_070_000))).toBe(true);
    const token = /t=([\w-]+)/.exec(tx.sent.at(-1)!.text)![1]!;
    expect(await verifyRecipient(db, token, {}, new Date(1_070_000 + 8 * 864e5))).toBeNull();
    const own = await db.docs<Recipient>("recipients").get(`${ORG}|owner@studio.test`);
    expect(own!.verifiedAt).toBeInstanceOf(Date);
  });

  it("the recipients plan limit is enforced and counts each address once", async () => {
    await expect(ensureRecipient(db, ORG, "second@studio.test")).rejects.toMatchObject({ status: 403 });
    expect(await ensureRecipient(db, ORG, "OWNER@studio.test")).toMatchObject({ email: "owner@studio.test" });
  });
});

describe("metering and held submissions", () => {
  const upgrade = () => db.setEntitlement(ORG, { ...NONE(Date.now()), isPaid: true, status: "active", plan: "starter", expiresAt: Date.now() + 30 * 864e5 });

  it("over the plan limit a legitimate submission is held, not rejected or counted; upgrading releases it", async () => {
    await db.incUsage(ORG, "submissions", periodOf(), 250); // Free plan limit
    const r = await submit({ message: "legit but over" });
    expect(r.response.status).toBe(303); // accepted, never rejected
    const [s] = await allSubs();
    expect(s).toMatchObject({ status: "held", holdReason: "over_limit" });
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(250);
    expect(await db.getUsage(ORG, "held", periodOf())).toBe(1);
    expect(tx.sent).toHaveLength(0);
    expect(await redeliver(db, s!._id, ORG, { transport: tx.t })).toBe("held_over_limit");

    expect(await releaseHeld(db, ORG, { transport: tx.t })).toBe(0); // still no room
    await upgrade();
    expect(await releaseHeld(db, ORG, { transport: tx.t })).toBe(1);
    expect((await db.docs<Submission>("submissions").get(s!._id))!.status).toBe("dispatched");
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(251);
    expect(tx.sent).toHaveLength(1);
  });

  it("a new month releases held submissions through the cron job, oldest first, only as far as the limit allows", async () => {
    await db.incUsage(ORG, "submissions", periodOf(), 250);
    await submit({ message: "one" });
    await submit({ message: "two" });
    expect((await allSubs()).every((s) => s.status === "held")).toBe(true);
    const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 2));
    const res = await deliverPending(db, { transport: tx.t, now: () => nextMonth });
    expect(res.released).toBe(2);
    expect(tx.sent.map((m) => m.text).join()).toContain("one");
    expect((await allSubs()).map((s) => s.status)).toEqual(["dispatched", "dispatched"]);
  });

  it("marking spam gives the quota unit back; Not spam counts it again and remembers the sender", async () => {
    await submit({ email: "p@visitor.test", message: "hello friend" });
    const [s] = await allSubs();
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(1);
    await markSpam(db, s!._id, ORG);
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(0);
    expect((await db.docs<Submission>("submissions").get(s!._id))!.status).toBe("quarantined");
    expect(await releaseSubmission(db, "nope", ORG, "u1", { transport: tx.t })).toBeNull();
    const out = await releaseSubmission(db, s!._id, ORG, "u1", { transport: tx.t });
    expect(out!.status).toBe("dispatched");
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(1);
    expect(await db.docs("sender_allow").get(`${form._id}|p@visitor.test`)).not.toBeNull();
  });

  it("Not spam on a quarantined post delivers and a second post from that sender skips content scoring", async () => {
    const spammy = { email: "friend@visitor.test", message: "http://a.test http://b.test http://c.test http://d.test <script>" };
    await submit(spammy);
    const [s] = await allSubs();
    expect(s!.status).toBe("quarantined");
    await releaseSubmission(db, s!._id, ORG, "u1", { transport: tx.t });
    expect(tx.sent).toHaveLength(1);
    await submit(spammy);
    expect((await allSubs())[1]!.status).toBe("dispatched");
    expect(tx.sent).toHaveLength(2);
  });
});

describe("delivery events and receipts", () => {
  beforeEach(() => submit({ email: "a@visitor.test", message: "x" }));
  const at = (s: number) => new Date(Date.now() + s * 1000);

  it("deferred then accepted produce both stamps in order and end delivered", async () => {
    await applyMailEvent(db, { id: "d1", messageId: "msg_1", type: "deferred", at: at(2), detail: "451 try later" });
    let [s] = await allSubs();
    expect(s!.status).toBe("dispatched");
    await applyMailEvent(db, { id: "a1", messageId: "msg_1", type: "accepted", at: at(30) });
    [s] = await allSubs();
    expect(s!.status).toBe("delivered");
    const d = await getDetail(db, ORG, s!._id);
    expect(d!.steps.map((x) => x.label)).toEqual(["Received", "Sorted", "Dispatched", "Deferred", "Accepted"]);
    expect(d!.steps[3]!.detail).toBe("451 try later");
    expect(timelineOpen(d!.steps)).toBe(false);
  });

  it("the receipt is open (polling) while dispatched or deferred", async () => {
    const [s] = await allSubs();
    expect(timelineOpen((await getDetail(db, ORG, s!._id))!.steps)).toBe(true);
    await applyMailEvent(db, { id: "d1", messageId: "msg_1", type: "deferred", at: at(2) });
    expect(timelineOpen((await getDetail(db, ORG, s!._id))!.steps)).toBe(true);
  });

  it("is idempotent by event id and ignores unknown messages", async () => {
    expect(await applyMailEvent(db, { id: "a1", messageId: "msg_1", type: "accepted", at: at(1) })).toBe("applied");
    expect(await applyMailEvent(db, { id: "a1", messageId: "msg_1", type: "accepted", at: at(1) })).toBe("duplicate");
    expect(await applyMailEvent(db, { messageId: "nope", type: "accepted", at: at(1) })).toBe("unknown");
    expect(await applyMailEvent(db, { messageId: "msg_1", type: "dispatched", at: at(1) })).toBe("ignored");
    expect(await db.docs("delivery_events").count({ type: "accepted" })).toBe(1);
  });

  it("never moves a delivery backwards (late deferred after accepted)", async () => {
    await applyMailEvent(db, { id: "a1", messageId: "msg_1", type: "accepted", at: at(5) });
    await applyMailEvent(db, { id: "d1", messageId: "msg_1", type: "deferred", at: at(3) });
    expect((await db.docs<Delivery>("deliveries").findOne({ mailerMessageId: "msg_1" }))!.status).toBe("accepted");
    expect((await allSubs())[0]!.status).toBe("delivered");
  });

  it("a hard bounce returns the submission, suppresses the address and flags the recipient", async () => {
    await applyMailEvent(db, { id: "b1", messageId: "msg_1", type: "returned", classification: "hard", at: at(3), detail: "550 no such user", recipient: "owner@studio.test" });
    const [s] = await allSubs();
    expect(s!.status).toBe("returned");
    expect(await db.isSuppressed("owner@studio.test", `org:${ORG}`)).toBe(true);
    expect(await db.isSuppressed("owner@studio.test", "org:other_org")).toBe(false); // scoped per org
    const r = await db.docs<Recipient>("recipients").get(`${ORG}|owner@studio.test`);
    expect(r!.bounceDetail).toBe("550 no such user");
    // the next submission is blocked for that address, with a timeline entry
    await submit({ message: "again" });
    const second = (await allSubs())[1]!;
    expect(second.status).toBe("returned");
    expect(tx.sent).toHaveLength(1);
    expect((await getDetail(db, ORG, second._id))!.steps.map((x) => x.label)).toContain("Blocked");
  });

  it("a soft bounce does not suppress; a complaint does", async () => {
    await applyMailEvent(db, { id: "s1", messageId: "msg_1", type: "returned", classification: "soft", at: at(1), recipient: "owner@studio.test" });
    expect(await db.isSuppressed("owner@studio.test", `org:${ORG}`)).toBe(false);
    expect((await allSubs())[0]!.status).toBe("dispatched");
    await applyMailEvent(db, { id: "c1", messageId: "msg_1", type: "complaint", at: at(2), recipient: "owner@studio.test" });
    expect(await db.isSuppressed("owner@studio.test", `org:${ORG}`)).toBe(true);
  });

  it("redeliver creates new deliveries with their own timeline; unsuppress is capped at 3 a day", async () => {
    const [s] = await allSubs();
    expect(await redeliver(db, s!._id, ORG, { transport: tx.t })).toBe("ok");
    expect(tx.sent).toHaveLength(2);
    expect(await db.docs("deliveries").count({ submissionId: s!._id })).toBe(2);
    expect(await redeliver(db, s!._id, "other_org", { transport: tx.t })).toBe("not_found");
    const rid = `${ORG}|owner@studio.test`;
    for (let i = 0; i < 3; i++) expect(await unsuppressRecipient(db, ORG, rid)).toBe("ok");
    expect(await unsuppressRecipient(db, ORG, rid)).toBe("limit");
    expect(await unsuppressRecipient(db, "other_org", rid)).toBe("not_found");
  });
});

describe("retries with backoff (deliver-pending)", () => {
  it("a failing provider keeps the delivery queued, backs off, then succeeds on retry", async () => {
    let down = true;
    tx = fakeTransport({ fail: () => down });
    const t0 = new Date();
    await handleFormPost(db, post(form.key, { message: "retry me" }), form.key, { transport: tx.t, now: () => t0 }).then((r) => r.background?.());
    const d = (await db.docs<Delivery>("deliveries").find({}))[0]!;
    expect(d).toMatchObject({ status: "queued", attempts: 1 });
    expect(d.nextAttemptAt!.getTime()).toBe(t0.getTime() + BACKOFF_MS[0]!);
    expect(await deliverPending(db, { transport: tx.t, now: () => new Date(t0.getTime() + 30_000) })).toMatchObject({ retried: 0 });
    down = false;
    expect(await deliverPending(db, { transport: tx.t, now: () => new Date(t0.getTime() + 61_000) })).toMatchObject({ retried: 1 });
    expect((await db.docs<Delivery>("deliveries").get(d._id))!.status).toBe("dispatched");
    expect((await allSubs())[0]!.status).toBe("dispatched");
  });

  it("gives up after the last attempt and marks the submission failed", async () => {
    tx = fakeTransport({ fail: () => true });
    let now = new Date();
    await handleFormPost(db, post(form.key, { message: "never" }), form.key, { transport: tx.t, now: () => now }).then((r) => r.background?.());
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      now = new Date(now.getTime() + 7 * 3600_000);
      await deliverPending(db, { transport: tx.t, now: () => now });
    }
    expect((await db.docs<Delivery>("deliveries").find({}))[0]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect((await allSubs())[0]!.status).toBe("failed");
  });

  it("re-drives a submission stuck in received (the after() step never ran) and expires old deferrals", async () => {
    const r = await handleFormPost(db, post(form.key, { message: "stuck" }), form.key, { transport: tx.t });
    expect(r.response.status).toBe(303); // background deliberately not run
    expect((await allSubs())[0]!.status).toBe("received");
    const later = new Date(Date.now() + 3 * 60_000);
    expect(await deliverPending(db, { transport: tx.t, now: () => later })).toMatchObject({ reprocessed: 1 });
    expect((await allSubs())[0]!.status).toBe("dispatched");
    await applyMailEvent(db, { id: "d", messageId: "msg_1", type: "deferred", at: new Date(Date.now() - 4 * 864e5) });
    await db.docs<Delivery>("deliveries").update({ mailerMessageId: "msg_1" }, { lastEventAt: new Date(Date.now() - 4 * 864e5) });
    expect(await deliverPending(db, { transport: tx.t })).toMatchObject({ expired: 1 });
    expect((await allSubs())[0]!.status).toBe("returned");
  });

  it("processSubmission twice does not dispatch twice", async () => {
    const r = await handleFormPost(db, post(form.key, { message: "once" }), form.key, { transport: tx.t });
    await r.background?.();
    const [s] = await allSubs();
    await processSubmission(db, s!._id, { transport: tx.t });
    expect(tx.sent).toHaveLength(1);
  });

  it("the console provider accepts immediately so the five stamps show without a webhook", async () => {
    tx = fakeTransport({ provider: "console" });
    await submit({ message: "dev mode" });
    const [s] = await allSubs();
    expect(s!.status).toBe("delivered");
    expect((await getDetail(db, ORG, s!._id))!.steps.map((x) => x.label)).toEqual(["Received", "Sorted", "Dispatched", "Accepted"]);
  });
});

describe("provider webhook events", () => {
  const secretRaw = new Uint8Array(24).map((_, i) => i + 1);
  const secret = `whsec_${Buffer.from(secretRaw).toString("base64")}`;
  async function sign(id: string, ts: number, body: string) {
    const key = await crypto.subtle.importKey("raw", secretRaw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return `v1,${Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`))).toString("base64")}`;
  }

  it("maps provider events to MailEvents", () => {
    const base = { created_at: "2026-11-05T10:00:00Z", data: { email_id: "m1", to: ["Ada@X.test"] } };
    expect(mapResendEvent({ ...base, type: "email.delivered" })).toMatchObject({ type: "accepted", messageId: "m1", recipient: "ada@x.test" });
    expect(mapResendEvent({ ...base, type: "email.delivery_delayed" })).toMatchObject({ type: "deferred" });
    expect(mapResendEvent({ ...base, type: "email.bounced", data: { ...base.data, bounce: { type: "Permanent", message: "no such user" } } })).toMatchObject({ type: "returned", classification: "hard", detail: "no such user" });
    expect(mapResendEvent({ ...base, type: "email.bounced", data: { ...base.data, bounce: { type: "Transient" } } })).toMatchObject({ classification: "soft" });
    expect(mapResendEvent({ ...base, type: "email.complained" })).toMatchObject({ type: "complaint" });
    expect(mapResendEvent({ ...base, type: "email.opened" })).toBeNull();
    expect(mapResendEvent({ type: "email.delivered", data: {} })).toBeNull();
  });

  it("verifies the Svix style signature, rejects bad, stale and missing ones", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "m1" } });
    const ts = Math.floor(Date.now() / 1000);
    const headers = (sig: string, t = ts) => new Headers({ "svix-id": "evt_1", "svix-timestamp": String(t), "svix-signature": sig });
    expect(await verifySvix(secret, headers(await sign("evt_1", ts, body)), body)).toBe(true);
    expect(await verifySvix(secret, headers(`v1,AAAA ${await sign("evt_1", ts, body)}`), body)).toBe(true);
    expect(await verifySvix(secret, headers(await sign("evt_1", ts, body)), body + " ")).toBe(false);
    expect(await verifySvix(secret, headers("v1,AAAA"), body)).toBe(false);
    expect(await verifySvix(secret, headers(await sign("evt_1", ts - 3600, body), ts - 3600), body)).toBe(false);
    expect(await verifySvix(secret, new Headers(), body)).toBe(false);
  });

  it("an event source parses a signed request and throws on a forged one", async () => {
    const body = JSON.stringify({ type: "email.delivered", created_at: "2026-11-05T10:00:00Z", data: { email_id: "m9", to: ["a@b.co"] } });
    const ts = Math.floor(Date.now() / 1000);
    const req = new Request("http://x/api/hooks/mail", { method: "POST", body, headers: { "svix-id": "evt_9", "svix-timestamp": String(ts), "svix-signature": await sign("evt_9", ts, body) } });
    expect(await resendEventSource(secret).verifyAndParse(req, body)).toMatchObject([{ id: "evt_9", messageId: "m9", type: "accepted" }]);
    const forged = new Request("http://x/api/hooks/mail", { method: "POST", body, headers: { "svix-id": "evt_9", "svix-timestamp": String(ts), "svix-signature": "v1,AAAA" } });
    await expect(resendEventSource(secret).verifyAndParse(forged, body)).rejects.toThrow("bad_signature");
  });
});

describe("templates", () => {
  const sub = { fields: { name: "Ada <b>", message: "line1\nline2" }, replyTo: "a@b.co", subject: undefined } as unknown as Submission;
  it("escapes every field value in HTML, keeps plain text raw", () => {
    const m = renderNotification({ name: "Contact", subjectTemplate: "Hi {{name}}" }, sub);
    expect(m.html).toContain("Ada &lt;b&gt;");
    expect(m.html).not.toContain("<b>");
    expect(m.text).toContain("name: Ada <b>");
  });
  it("subject variables: missing renders empty, newlines are stripped, a posted subject wins", () => {
    expect(renderSubject("New: {{name}} / {{nope}}", { name: "C" }, { fields: { name: "Ada\r\nBcc: x" }, subject: undefined })).toBe("New: Ada Bcc: x /");
    expect(renderSubject("{{missing}}", { name: "Contact" }, { fields: {}, subject: undefined })).toBe("New submission on Contact");
    expect(renderSubject("T", { name: "C" }, { fields: {}, subject: "Posted" })).toBe("Posted");
  });
  it("timelineSteps keeps stamp order when events share an instant", () => {
    const t = new Date(1000);
    const steps = timelineSteps([{ _id: "3", type: "accepted", at: t }, { _id: "1", type: "received", at: t }, { _id: "2", type: "sorted", at: t }, { _id: "d", type: "dispatched", at: t }]);
    expect(steps.map((s) => s.label)).toEqual(["Received", "Sorted", "Dispatched", "Accepted"]);
  });
});

describe("inbox query and CSV export", () => {
  it("filters, searches (case-insensitive) and scopes by org and form", async () => {
    await submit({ email: "ada@visitor.test", message: "Need a Quote for the website" });
    await submit({ email: "bob@visitor.test", message: "Hello" });
    await submit({ message: "x", _gotcha: "bot" });
    expect((await listSubmissions(db, ORG, { filter: "all" })).length).toBe(2);
    expect((await listSubmissions(db, ORG, { filter: "spam" })).length).toBe(1);
    expect((await listSubmissions(db, ORG, { q: "QUOTE" })).map((s) => s.emailLower)).toEqual(["ada@visitor.test"]);
    expect((await listSubmissions(db, ORG, { q: "ada@" })).length).toBe(1);
    expect((await listSubmissions(db, "other_org", {})).length).toBe(0);
    expect((await listSubmissions(db, ORG, { formId: "nope" })).length).toBe(0);
    expect((await listSubmissions(db, ORG, { filter: "delivered" })).length).toBe(0);
  });

  it("CSV quotes properly, adds one column per field and neutralises spreadsheet formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
    const rows = [
      { _id: "s1", receivedAt: new Date(0), formId: "f1", status: "delivered", spamScore: 0, replyTo: "a@b.co", fromName: "Ada", fields: { message: "hi, there", name: "Ada" } },
      { _id: "s2", receivedAt: new Date(1000), formId: "f1", status: "quarantined", spamScore: 1, fields: { phone: "=1+1" } },
    ] as unknown as Submission[];
    const csv = toCsv(rows, { f1: "Contact" }).replace(/^﻿/, "");
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("id,received_at,form,status,spam_score,reply_to,name,subject,message,name,phone");
    expect(lines[1]).toBe('s1,1970-01-01T00:00:00.000Z,Contact,delivered,0,a@b.co,Ada,,"hi, there",Ada,');
    expect(lines[2]).toBe("s2,1970-01-01T00:00:01.000Z,Contact,quarantined,1,,,,,,'=1+1");
  });
});
