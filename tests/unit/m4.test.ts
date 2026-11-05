import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { limitFor, lifetimeEntitlement, computeEntitlement } from "@/lib/billing/entitlement";
import { periodOf } from "@/lib/billing/usage";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { allPass, checkRecords, expectedRecords, normalizeDomain, runCheck, addDomain, type Resolver } from "@/lib/domains";
import { classifyStatus, parseDsn, rawFromBody } from "@/lib/mail/dsn";
import { smtpConfigFromEnv, nodemailerOptions, parseVerp, smtpTransport, verpReturnPath, type SmtpConfig } from "@/lib/mail/smtp";
import { transportFromEnv } from "@/lib/mail";
import { SENSITIVE_FIELD, abuseSignals, assertFounder, founderSearch, mailPipeline, orgSuspended, runFounderAction, workspaceSummary, FounderAction } from "@/lib/founder";
import { createForm, updateForm } from "@/lib/forms/store";
import type { Delivery, Form, Submission } from "@/lib/forms/types";
import { HttpError } from "@/lib/http";
import { lastPeriods, niceMax, usageReport } from "@/lib/usage/report";
import { fakeStripe } from "./fakes";
import { POST as dsnHook } from "@/app/api/hooks/dsn/route";
import { getDb } from "@/lib/db";

const FOUNDER = { id: "u_f", email: "Founder@Example.com" };
const ORG = "org_m4";
let db: Db;
const savedEnv = { ...process.env };
beforeEach(() => { db = createMemoryDb("postslot"); process.env.ADMIN_EMAILS = "founder@example.com"; });
afterEach(() => { process.env = { ...savedEnv }; });

const mkForm = (orgId = ORG) => createForm(db, { orgId, userEmail: "owner@x.test", emailVerified: true }, "Contact");
const audits = (orgId: string) => db.listAudit(orgId, { limit: 50 });

describe("founder admin permissions and audit", () => {
  it("only ADMIN_EMAILS pass, case-insensitively; everyone else gets a 404", () => {
    expect(() => assertFounder("founder@EXAMPLE.com")).not.toThrow();
    for (const e of ["intruder@example.com", "", null, undefined]) {
      try { assertFounder(e); throw new Error("should throw"); } catch (x) { expect(x).toBeInstanceOf(HttpError); expect((x as HttpError).status).toBe(404); }
    }
  });

  it("with no ADMIN_EMAILS nobody is a founder", () => {
    delete process.env.ADMIN_EMAILS;
    expect(() => assertFounder("founder@example.com")).toThrow(HttpError);
  });

  it("a non-founder cannot run an action and nothing is written", async () => {
    const f = await mkForm();
    await expect(runFounderAction(db, { id: "u_x", email: "intruder@example.com" }, { type: "form.suspend", formId: f._id })).rejects.toMatchObject({ status: 404 });
    expect((await db.docs<Form>("forms").get(f._id))!.status).toBe("active");
    expect(await audits(ORG)).toHaveLength(0);
  });

  it("suspend and unsuspend a form, each with an audit entry naming the founder and the reason", async () => {
    const f = await mkForm();
    await updateForm(db, ORG, f._id, { status: "paused" });
    await runFounderAction(db, FOUNDER, { type: "form.suspend", formId: f._id, reason: "phishing" });
    expect((await db.docs<Form>("forms").get(f._id))!.status).toBe("suspended");
    await expect(updateForm(db, ORG, f._id, { name: "x" })).rejects.toMatchObject({ code: "form_suspended" });
    await runFounderAction(db, FOUNDER, { type: "form.unsuspend", formId: f._id });
    expect((await db.docs<Form>("forms").get(f._id))!.status).toBe("paused"); // restored, not forced active
    const log = await audits(ORG);
    expect(log.map((a) => a.action).sort()).toEqual(["admin.form.suspend", "admin.form.unsuspend"]);
    const s = log.find((a) => a.action === "admin.form.suspend")!;
    expect(s).toMatchObject({ actorId: "u_f", target: f._id, meta: { by: "Founder@Example.com", reason: "phishing" } });
  });

  it("suspending a workspace suspends every form and blocks new ones; unsuspend restores", async () => {
    const a = await mkForm();
    const b = await mkForm();
    await runFounderAction(db, FOUNDER, { type: "org.suspend", orgId: ORG, reason: "abuse" });
    expect(await orgSuspended(db, ORG)).toBe(true);
    expect((await db.docs<Form>("forms").find({ orgId: ORG })).every((f) => f.status === "suspended")).toBe(true);
    await expect(mkForm()).rejects.toMatchObject({ code: "workspace_suspended" });
    await runFounderAction(db, FOUNDER, { type: "org.unsuspend", orgId: ORG });
    expect(await orgSuspended(db, ORG)).toBe(false);
    expect((await db.docs<Form>("forms").get(a._id))!.status).toBe("active");
    expect((await db.docs<Form>("forms").get(b._id))!.status).toBe("active");
    await expect(mkForm()).resolves.toBeTruthy();
    expect((await audits(ORG)).filter((x) => x.action.startsWith("admin.org.")).length).toBe(2);
  });

  it("plan override and limit override change the effective limit and survive a Stripe recompute", async () => {
    await runFounderAction(db, FOUNDER, { type: "plan.set", orgId: ORG, plan: "pro" });
    expect(limitFor(await db.getEntitlement(ORG), "submissions")).toBe(10000);
    await runFounderAction(db, FOUNDER, { type: "limit.set", orgId: ORG, meter: "submissions", value: 12345 });
    let ent = await db.getEntitlement(ORG);
    expect(limitFor(ent, "submissions")).toBe(12345);
    expect(limitFor(ent, "recipients")).toBe(5);
    // A Stripe recompute with no subscriptions keeps a manual grant and the override.
    const stripe = fakeStripe();
    ent = await computeEntitlement(stripe as never, "postslot", "cus_x", ent, Date.now());
    expect(limitFor(ent, "submissions")).toBe(12345);
    await runFounderAction(db, FOUNDER, { type: "limit.set", orgId: ORG, meter: "submissions", value: null });
    expect(limitFor(await db.getEntitlement(ORG), "submissions")).toBe(10000);
    await runFounderAction(db, FOUNDER, { type: "plan.set", orgId: ORG, plan: "free" });
    expect(limitFor(await db.getEntitlement(ORG), "submissions")).toBe(250);
    expect((await audits(ORG)).map((a) => a.action)).toContain("admin.plan.set");
  });

  it("a limit override alone raises a Free workspace without making it paid", async () => {
    await runFounderAction(db, FOUNDER, { type: "limit.set", orgId: ORG, meter: "submissions", value: 400 });
    const ent = await db.getEntitlement(ORG);
    expect(ent?.isPaid).toBe(false);
    expect(limitFor(ent, "submissions")).toBe(400);
  });

  it("suppression list: add, search, remove, each audited", async () => {
    await runFounderAction(db, FOUNDER, { type: "suppression.add", email: "Bad@Example.com", scope: `org:${ORG}`, reason: "requested" });
    expect(await db.isSuppressed("bad@example.com", `org:${ORG}`)).toBe(true);
    expect((await db.listSuppressions({ q: "BAD@" }))[0]).toMatchObject({ email: "bad@example.com", reason: "manual", scope: `org:${ORG}` });
    await runFounderAction(db, FOUNDER, { type: "suppression.remove", email: "bad@example.com", scope: `org:${ORG}` });
    expect(await db.isSuppressed("bad@example.com", `org:${ORG}`)).toBe(false);
    expect((await audits(ORG)).map((a) => a.action).sort()).toEqual(["admin.suppression.add", "admin.suppression.remove"]);
  });

  it("the action schema rejects bad input", () => {
    expect(FounderAction.safeParse({ type: "plan.set", orgId: "o", plan: "enterprise" }).success).toBe(false);
    expect(FounderAction.safeParse({ type: "limit.set", orgId: "o", meter: "submissions", value: -1 }).success).toBe(false);
    expect(FounderAction.safeParse({ type: "suppression.add", email: "nope" }).success).toBe(false);
    expect(FounderAction.safeParse({ type: "delete.everything" }).success).toBe(false);
  });

  it("search finds forms by id, key and name and submissions by id, with metadata only", async () => {
    const f = await mkForm();
    const sub: Submission = { _id: "sub_1", orgId: ORG, formId: f._id, receivedAt: new Date(), status: "quarantined", fields: { message: "PRIVATE CONTENT" }, searchText: "private", spamScore: 0.9, signals: [{ name: "links", weight: 0.5 }], scored: true, isTest: false, ipHash: "h" };
    await db.docs<Submission>("submissions").insert(sub);
    expect((await founderSearch(db, f._id)).forms[0]!._id).toBe(f._id);
    expect((await founderSearch(db, f.key)).forms[0]!._id).toBe(f._id);
    expect((await founderSearch(db, "contact")).forms).toHaveLength(1);
    const r = await founderSearch(db, "sub_1");
    expect(r.submission).toMatchObject({ id: "sub_1", orgId: ORG, status: "quarantined", signals: ["links"] });
    expect(JSON.stringify(r)).not.toContain("PRIVATE CONTENT");
    expect((await founderSearch(db, ORG)).workspaces[0]!.id).toBe(ORG); // known by its forms even without an auth record
    expect(await founderSearch(db, "  ")).toEqual({ workspaces: [], forms: [], submission: null });
  });

  it("workspace summary reports usage and abuse signals; pipeline counts stuck work", async () => {
    const f = await mkForm();
    const now = new Date();
    for (let i = 0; i < 25; i++) await db.incUsage(ORG, "spam", periodOf(now));
    await db.incUsage(ORG, "submissions", periodOf(now), 2);
    await db.docs<Submission>("submissions").insert({ _id: "s1", orgId: ORG, formId: f._id, receivedAt: new Date(now.getTime() - 10 * 60_000), status: "received", fields: { password: "x" }, searchText: "", spamScore: 0, signals: [], scored: false, isTest: false, ipHash: "h" });
    const w = await workspaceSummary(db, ORG, now);
    expect(w.usage).toMatchObject({ submissions: 2, spam: 25 });
    expect(w.signals.map((s) => s.id).sort()).toEqual(["sensitive_fields", "spam_ratio"]);
    const p = await mailPipeline(db, now);
    expect(p.stuckReceived).toBe(1);
    expect(p.provider).toBe("console");
  });
});

describe("abuse signals", () => {
  const base = { legit: 100, spam: 0, deliveries: 0, returned: 0, complaints: 0, sensitiveFields: [] as string[] };
  it("fires at the documented thresholds and not below", () => {
    expect(abuseSignals(base)).toEqual([]);
    expect(abuseSignals({ ...base, legit: 5, spam: 95 }).map((s) => s.id)).toEqual(["spam_ratio"]);
    expect(abuseSignals({ ...base, legit: 5, spam: 45 })).toEqual([]); // exactly 90% is not over
    expect(abuseSignals({ ...base, legit: 1, spam: 5 })).toEqual([]); // too little volume
    expect(abuseSignals({ ...base, deliveries: 100, returned: 5 }).map((s) => s.id)).toEqual(["bounce_rate"]);
    expect(abuseSignals({ ...base, deliveries: 100, returned: 4 })).toEqual([]);
    expect(abuseSignals({ ...base, deliveries: 1000, complaints: 1 }).map((s) => s.id)).toEqual(["complaint_rate"]);
    expect(abuseSignals({ ...base, deliveries: 10, returned: 10, complaints: 3 })).toEqual([]); // below min volume
    expect(abuseSignals({ ...base, sensitiveFields: ["cvv"] })[0]!.severity).toBe("high");
  });
  it("recognises credential and card field names", () => {
    for (const k of ["password", "Card_Number", "cvv", "ssn", "iban", "user_pass"]) expect(SENSITIVE_FIELD.test(k)).toBe(true);
    for (const k of ["name", "email", "message", "company"]) expect(SENSITIVE_FIELD.test(k)).toBe(false);
  });
});

describe("SmtpMailer with a fake transport", () => {
  const cfg: SmtpConfig = { host: "mta.test", port: 587, secure: false, user: "u", pass: "p", bounceDomain: "bounce.postslot.test", dkim: { domainName: "postslot.test", keySelector: "s1", privateKey: "PEM" } };
  const make = (over: Partial<SmtpConfig> = {}, result: Record<string, unknown> = { accepted: ["a@b.test"], rejected: [] }) => {
    const calls: { options: Record<string, unknown>; mail: Record<string, unknown> }[] = [];
    const t = smtpTransport({ ...cfg, ...over }, { create: (options) => ({ sendMail: async (mail) => { calls.push({ options, mail }); return result; } }) });
    return { t, calls };
  };
  const msg = { to: "Ada@Example.com", from: "Postslot <no-reply@postslot.test>", subject: "Hi", text: "body", html: "<p>body</p>", replyTo: "v@x.test", headers: { "Feedback-ID": "f:o:postslot" } };

  it("sends with DKIM options, a VERP envelope, our message id and the Mailer result shape", async () => {
    const { t, calls } = make();
    const r = await t.send(msg);
    expect(r).toMatchObject({ provider: "smtp", accepted: true });
    const { options, mail } = calls[0]!;
    expect(options).toMatchObject({ host: "mta.test", port: 587, secure: false, auth: { user: "u", pass: "p" }, dkim: { domainName: "postslot.test", keySelector: "s1", privateKey: "PEM" } });
    expect(mail).toMatchObject({ from: msg.from, to: msg.to, subject: "Hi", replyTo: "v@x.test", messageId: `<${r.id}@postslot.test>` });
    expect((mail.headers as Record<string, string>)["X-Postslot-Id"]).toBe(r.id);
    expect((mail.headers as Record<string, string>)["Feedback-ID"]).toBe("f:o:postslot");
    const env = mail.envelope as { from: string; to: string[] };
    expect(env.to).toEqual([msg.to]);
    expect(env.from).toBe(verpReturnPath(r.id, msg.to, "bounce.postslot.test"));
    expect(parseVerp(env.from)).toEqual({ messageId: r.id, recipient: "ada@example.com" });
  });

  it("no auth or DKIM when not configured; bounce domain defaults to the From domain", async () => {
    const { t, calls } = make({ user: undefined, pass: undefined, dkim: undefined, bounceDomain: undefined });
    await t.send(msg);
    expect(calls[0]!.options.auth).toBeUndefined();
    expect(calls[0]!.options.dkim).toBeUndefined();
    expect((calls[0]!.mail.envelope as { from: string }).from.endsWith("@postslot.test")).toBe(true);
  });

  it("fails loudly when not configured, when the server rejects, and when the daily cap is hit", async () => {
    await expect(smtpTransport(null).send(msg)).rejects.toThrow("smtp_not_configured");
    const rejected = make({}, { accepted: [], rejected: ["ada@example.com"] });
    await expect(rejected.t.send(msg)).rejects.toThrow("smtp_rejected");
    let count = 0;
    const capped = smtpTransport({ ...cfg, dailyCap: 2 }, { create: () => ({ sendMail: async () => ({ accepted: ["x"], rejected: [] }) }), dailyCount: async () => ++count });
    await capped.send(msg); await capped.send(msg);
    await expect(capped.send(msg)).rejects.toThrow("smtp_daily_cap_reached");
  });

  it("default daily counter uses the Db rate limiter keyed by the UTC day", async () => {
    const capped = smtpTransport({ ...cfg, dailyCap: 1 }, { create: () => ({ sendMail: async () => ({ accepted: ["x"], rejected: [] }) }), now: () => new Date("2026-11-05T10:00:00Z") });
    await capped.send(msg);
    await expect(capped.send(msg)).rejects.toThrow("smtp_daily_cap_reached");
  });

  it("reads config from env and stays opt-in: the default provider is unchanged", () => {
    expect(smtpConfigFromEnv({ NODE_ENV: "test", APP_NAME: "postslot" })).toBeNull();
    const c = smtpConfigFromEnv({ NODE_ENV: "test", APP_NAME: "postslot", SMTP_HOST: "h", SMTP_PORT: "465", SMTP_DKIM_DOMAIN: "d.test", SMTP_DKIM_SELECTOR: "s", SMTP_DKIM_PRIVATE_KEY: "a\\nb", SMTP_DAILY_CAP: "50" })!;
    expect(c).toMatchObject({ host: "h", port: 465, secure: true, dailyCap: 50, dkim: { domainName: "d.test", privateKey: "a\nb" } });
    expect(nodemailerOptions(c)).toMatchObject({ pool: false, host: "h" });
    expect(transportFromEnv().name).toBe("console"); // MAIL_PROVIDER=console in the test env
    process.env.MAIL_PROVIDER = "smtp";
    expect(transportFromEnv().name).toBe("smtp");
  });
});

// ---- DSN fixtures ------------------------------------------------------------------------------------------------
const ID = "0198aaaa-bbbb-7ccc-8ddd-eeeeffff0001";
const dsn = (o: { to?: string; action: string; status: string; diag?: string; rcpt?: string; embeddedId?: string }) => [
  "From: MAILER-DAEMON@mx.example.net",
  `To: ${o.to ?? `bounce+${ID}=ada=example.com@bounce.postslot.test`}`,
  "Subject: Undelivered Mail Returned to Sender",
  "Message-ID: <dsn-1@mx.example.net>",
  'Content-Type: multipart/report; report-type=delivery-status; boundary="B"',
  "",
  "--B",
  "Content-Type: text/plain",
  "",
  "This is the mail system. Delivery to the following recipient failed.",
  "",
  "--B",
  "Content-Type: message/delivery-status",
  "",
  "Reporting-MTA: dns; mx.example.net",
  "",
  `Final-Recipient: rfc822; ${o.rcpt ?? "Ada@Example.com"}`,
  `Action: ${o.action}`,
  `Status: ${o.status}`,
  `Diagnostic-Code: smtp; ${o.diag ?? "550 5.1.1 <ada@example.com>: user unknown"}`,
  "",
  "--B",
  "Content-Type: message/rfc822",
  "",
  `Message-ID: <${o.embeddedId ?? ID}@postslot.test>`,
  "Subject: New submission",
  "",
  "--B--",
].join("\r\n");

describe("DSN bounce parser", () => {
  const at = new Date("2026-11-05T12:00:00Z");
  it("hard bounce: user unknown, message id from the VERP address", () => {
    const r = parseDsn(dsn({ action: "failed", status: "5.1.1" }), at);
    expect(r.kind).toBe("dsn");
    expect(r.events).toEqual([{ id: "dsn:<dsn-1@mx.example.net>|ada@example.com", messageId: ID, type: "returned", classification: "hard", at, recipient: "ada@example.com", detail: "5.1.1 550 5.1.1 <ada@example.com>: user unknown" }]);
  });
  it("soft bounces: delayed and 4.x.x become deferred / soft", () => {
    expect(parseDsn(dsn({ action: "delayed", status: "4.4.1", diag: "connection timed out" })).events[0]).toMatchObject({ type: "deferred" });
    expect(parseDsn(dsn({ action: "failed", status: "4.2.2", diag: "452 mailbox full" })).events[0]).toMatchObject({ type: "returned", classification: "soft" });
    expect(parseDsn(dsn({ action: "failed", status: "5.2.2", diag: "552 mailbox full" })).events[0]).toMatchObject({ classification: "soft" });
  });
  it("policy and reputation rejections are blocks, not hard bounces", () => {
    expect(parseDsn(dsn({ action: "failed", status: "5.7.1", diag: "550 5.7.1 rejected as spam" })).events[0]).toMatchObject({ type: "returned", classification: "block" });
  });
  it("delivered DSN becomes accepted; relayed is ignored", () => {
    expect(parseDsn(dsn({ action: "delivered", status: "2.0.0", diag: "250 ok" })).events[0]).toMatchObject({ type: "accepted", messageId: ID });
    expect(parseDsn(dsn({ action: "relayed", status: "2.0.0" })).events).toEqual([]);
  });
  it("falls back to the embedded original Message-ID when the envelope has no VERP address", () => {
    const r = parseDsn(dsn({ to: "postmaster@postslot.test", action: "failed", status: "5.1.1" }), at);
    expect(r.events[0]).toMatchObject({ messageId: ID, recipient: "ada@example.com" });
  });
  it("abuse report (ARF) becomes a complaint", () => {
    const arf = [
      "From: <complaints@isp.example>", `To: bounce+${ID}=ada=example.com@bounce.postslot.test`, "Message-ID: <arf-1@isp.example>",
      'Content-Type: multipart/report; report-type=feedback-report; boundary="F"', "", "--F", "Content-Type: text/plain", "", "This is an abuse report.", "",
      "--F", "Content-Type: message/feedback-report", "", "Feedback-Type: abuse", "User-Agent: ISP/1.0", "Original-Rcpt-To: <ada@example.com>", "", "--F--",
    ].join("\n");
    const r = parseDsn(arf, at);
    expect(r.kind).toBe("arf");
    expect(r.events[0]).toMatchObject({ type: "complaint", messageId: ID, recipient: "ada@example.com" });
  });
  it("ordinary mail, out-of-office replies and garbage produce no events", () => {
    expect(parseDsn("From: a@b.test\nTo: support@x.test\nSubject: hello\n\nhi").events).toEqual([]);
    expect(parseDsn("").events).toEqual([]);
    expect(parseDsn(dsn({ to: "postmaster@postslot.test", action: "failed", status: "5.1.1", embeddedId: "has spaces" })).events).toEqual([]); // not our message
  });
  it("classifies status codes", () => {
    expect(classifyStatus("5.1.1", "failed")).toBe("hard");
    expect(classifyStatus("5.4.4", "failed")).toBe("hard");
    expect(classifyStatus("5.7.26", "failed")).toBe("block");
    expect(classifyStatus("4.7.0", "failed")).toBe("soft");
    expect(classifyStatus(undefined, "delayed")).toBe("soft");
    expect(classifyStatus(undefined, "failed")).toBe("hard");
  });
  it("accepts a raw body or JSON {raw}", () => {
    expect(rawFromBody("plain", "text/plain")).toBe("plain");
    expect(rawFromBody(JSON.stringify({ raw: "abc" }), "application/json")).toBe("abc");
    expect(rawFromBody("{not json", "application/json")).toBe("");
  });

  describe("/api/hooks/dsn", () => {
    const seed = async () => {
      const d = await getDb();
      const f = await createForm(d, { orgId: "org_dsn", userEmail: "ada@example.com", emailVerified: true }, "F");
      const sub: Submission = { _id: "sdsn", orgId: "org_dsn", formId: f._id, receivedAt: new Date(), status: "dispatched", fields: {}, searchText: "", spamScore: 0, signals: [], scored: true, isTest: false, ipHash: "h" };
      await d.docs<Submission>("submissions").insert(sub);
      const dl: Delivery = { _id: "ddsn", orgId: "org_dsn", submissionId: "sdsn", recipientId: "org_dsn|ada@example.com", recipientEmail: "ada@example.com", channel: "email", mailerMessageId: ID, status: "dispatched", attempts: 1, lastEventAt: new Date(), createdAt: new Date() };
      await d.docs<Delivery>("deliveries").insert(dl);
      return d;
    };
    const post = (body: string, auth?: string) => dsnHook(new Request("http://localhost/api/hooks/dsn", { method: "POST", body, headers: { "content-type": "text/plain", ...(auth ? { authorization: auth } : {}) } }));

    it("is closed without a configured secret or with a wrong one", async () => {
      expect((await post("x")).status).toBe(503);
      process.env.DSN_WEBHOOK_SECRET = "s3cret";
      expect((await post("x")).status).toBe(401);
      expect((await post("x", "Bearer nope")).status).toBe(401);
    });

    it("turns a hard bounce into a returned delivery, a suppression and a returned submission", async () => {
      process.env.DSN_WEBHOOK_SECRET = "s3cret";
      const d = await seed();
      const res = await post(dsn({ action: "failed", status: "5.1.1" }), "Bearer s3cret");
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, kind: "dsn", results: ["applied"] });
      expect((await d.docs<Delivery>("deliveries").get("ddsn"))!.status).toBe("returned");
      expect((await d.docs<Submission>("submissions").get("sdsn"))!.status).toBe("returned");
      expect(await d.isSuppressed("ada@example.com", "org:org_dsn")).toBe(true);
      // The MTA retrying the same hook is idempotent.
      expect(await (await post(dsn({ action: "failed", status: "5.1.1" }), "Bearer s3cret")).json()).toMatchObject({ results: ["duplicate"] });
    });
  });
});

// ---- DNS record checks -------------------------------------------------------------------------------------------
const dnsErr = (code: string) => Object.assign(new Error(code), { code });
function stub(txt: Record<string, string[][]>, cname: Record<string, string[]> = {}, fail: string[] = []): Resolver {
  return {
    resolveTxt: async (n) => { if (fail.includes(n)) throw dnsErr("ETIMEOUT"); if (!txt[n]) throw dnsErr("ENODATA"); return txt[n]!; },
    resolveCname: async (n) => { if (fail.includes(n)) throw dnsErr("ETIMEOUT"); if (!cname[n]) throw dnsErr("ENOTFOUND"); return cname[n]!; },
  };
}
const good = (d: string) => {
  const [spf, dkim, dmarc] = expectedRecords(d);
  return stub({ [d]: [[spf!.value]], [dmarc!.host]: [[dmarc!.value]] }, { [dkim!.host]: [`${dkim!.value}.`] });
};

describe("sending domain DNS checks", () => {
  it("lists the three records for a domain", () => {
    const r = expectedRecords("example.com");
    expect(r.map((x) => [x.id, x.type, x.host])).toEqual([["spf", "TXT", "example.com"], ["dkim", "CNAME", "postslot1._domainkey.example.com"], ["dmarc", "TXT", "_dmarc.example.com"]]);
    expect(r[0]!.value).toMatch(/^v=spf1 include:.+ ~all$/);
  });
  it("normalises and validates domains", () => {
    expect(normalizeDomain(" HTTPS://Mail.Example.COM/path ")).toBe("mail.example.com");
    for (const bad of ["localhost", "a b.com", "-x.com", "x..com", "", "1.2.3.4"]) expect(() => normalizeDomain(bad)).toThrow(HttpError);
  });
  it("all records present: pass, even when the DKIM CNAME has a trailing dot and a TXT is split in chunks", async () => {
    const [spf] = expectedRecords("example.com");
    const half = Math.floor(spf!.value.length / 2);
    const r = stub({ "example.com": [[spf!.value.slice(0, half), spf!.value.slice(half)]], "_dmarc.example.com": [["v=DMARC1; p=quarantine"]] }, { "postslot1._domainkey.example.com": ["postslot1.dkim.postslot.buffersoltech.com."] });
    const res = await checkRecords("example.com", r);
    expect(res.map((x) => x.status)).toEqual(["pass", "pass", "pass"]);
    expect(allPass(res)).toBe(true);
  });
  it("nothing published: three failures with a reason each", async () => {
    const res = await checkRecords("example.com", stub({}));
    expect(res.map((x) => x.status)).toEqual(["fail", "fail", "fail"]);
    expect(res.map((x) => x.detail)).toEqual(["No SPF record found at the domain.", "No CNAME found at the DKIM host.", "No DMARC record found at _dmarc."]);
    expect(allPass(res)).toBe(false);
  });
  it("SPF: wrong include and duplicate records fail", async () => {
    const wrong = await checkRecords("example.com", stub({ "example.com": [["v=spf1 include:_spf.google.com ~all"]] }));
    expect(wrong[0]).toMatchObject({ status: "fail", found: ["v=spf1 include:_spf.google.com ~all"] });
    expect(wrong[0]!.detail).toContain("does not include");
    const dup = await checkRecords("example.com", stub({ "example.com": [["v=spf1 ~all"], ["v=spf1 -all"]] }));
    expect(dup[0]!.detail).toContain("More than one SPF");
    expect((await checkRecords("example.com", stub({ "example.com": [["google-site-verification=abc"]] })))[0]!.detail).toContain("No SPF");
  });
  it("DKIM CNAME pointing elsewhere fails; DMARC without a policy fails", async () => {
    const r = await checkRecords("example.com", stub({ "_dmarc.example.com": [["v=DMARC1"]] }, { "postslot1._domainkey.example.com": ["other.example.net"] }));
    expect(r[1]).toMatchObject({ status: "fail", found: ["other.example.net"] });
    expect(r[2]).toMatchObject({ status: "fail" });
  });
  it("a resolver timeout is a failed check, not an exception", async () => {
    const r = await checkRecords("example.com", stub({}, {}, ["example.com", "postslot1._domainkey.example.com", "_dmarc.example.com"]));
    expect(r.every((x) => x.status === "fail" && x.detail.includes("lookup failed"))).toBe(true);
  });
  it("stores the result per workspace and enforces the five domain limit", async () => {
    await addDomain(db, ORG, "Example.com");
    await expect(addDomain(db, ORG, "example.com")).rejects.toMatchObject({ code: "domain_exists" });
    const d = await runCheck(db, ORG, "example.com", good("example.com"));
    expect(d.verified).toBe(true);
    expect(d.checkedAt).toBeInstanceOf(Date);
    expect((await runCheck(db, ORG, "example.com", stub({}))).verified).toBe(false);
    await expect(runCheck(db, "other_org", "example.com", stub({}))).rejects.toMatchObject({ status: 404 });
    for (const x of ["a", "b", "c", "d"]) await addDomain(db, ORG, `${x}.example.com`);
    await expect(addDomain(db, ORG, "f.example.com")).rejects.toMatchObject({ code: "domain_limit" });
  });
});

// ---- usage aggregation -------------------------------------------------------------------------------------------
describe("usage report", () => {
  const now = new Date("2026-11-15T09:00:00Z");
  const delivery = (id: string, status: Delivery["status"], at: string): Delivery => ({ _id: id, orgId: ORG, submissionId: "s", recipientId: "r", recipientEmail: "a@b.test", channel: "email", status, attempts: 1, lastEventAt: new Date(at), createdAt: new Date(at) });

  it("lists the last 12 UTC months oldest first, across a year boundary", () => {
    const p = lastPeriods(now);
    expect(p).toHaveLength(12);
    expect(p[0]).toBe("2025-12");
    expect(p[11]).toBe("2026-11");
    expect(lastPeriods(new Date("2026-01-31T23:59:59Z"), 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("aggregates counters and delivery outcomes per month and reads the plan limit", async () => {
    await db.incUsage(ORG, "submissions", "2026-11", 120);
    await db.incUsage(ORG, "spam", "2026-11", 40);
    await db.incUsage(ORG, "held", "2026-11", 3);
    await db.incUsage(ORG, "submissions", "2026-09", 200);
    await db.incUsage(ORG, "submissions", "2024-01", 999); // outside the window
    const ds = db.docs<Delivery>("deliveries");
    await ds.insert(delivery("d1", "accepted", "2026-11-02T10:00:00Z"));
    await ds.insert(delivery("d2", "accepted", "2026-11-14T10:00:00Z"));
    await ds.insert(delivery("d3", "returned", "2026-11-14T11:00:00Z"));
    await ds.insert(delivery("d4", "blocked", "2026-11-14T12:00:00Z"));
    await ds.insert(delivery("d5", "deferred", "2026-11-15T08:00:00Z"));
    await ds.insert(delivery("d6", "accepted", "2026-09-30T23:59:59Z"));
    await ds.insert(delivery("d7", "accepted", "2026-10-01T00:00:00Z")); // month boundary belongs to October
    await ds.insert({ ...delivery("d8", "accepted", "2026-11-03T00:00:00Z"), orgId: "someone_else" });
    const r = await usageReport(db, ORG, now);
    expect(r.limit).toBe(250);
    expect(r.months).toHaveLength(12);
    expect(r.current).toEqual({ period: "2026-11", submissions: 120, held: 3, spam: 40, accepted: 2, returned: 2, pending: 1 });
    expect(r.months.find((m) => m.period === "2026-09")).toMatchObject({ submissions: 200, accepted: 1 });
    expect(r.months.find((m) => m.period === "2026-10")).toMatchObject({ submissions: 0, accepted: 1 });
    expect(r.months.some((m) => m.submissions === 999)).toBe(false);
  });

  it("uses the paid plan and the founder's limit override", async () => {
    await db.setEntitlement(ORG, lifetimeEntitlement("starter", "pi", now.getTime()));
    expect((await usageReport(db, ORG, now)).limit).toBe(5000);
    await runFounderAction(db, FOUNDER, { type: "limit.set", orgId: ORG, meter: "submissions", value: 7000 });
    expect((await usageReport(db, ORG, now)).limit).toBe(7000);
  });

  it("chart axis maximum rounds up to a readable number", () => {
    expect([0, 7, 250, 251, 3000, 9999, 10001].map(niceMax)).toEqual([10, 10, 250, 500, 5000, 10000, 20000]);
  });
});
