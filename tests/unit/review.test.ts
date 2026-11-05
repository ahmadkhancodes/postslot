import { beforeEach, describe, expect, it } from "vitest";
import { product } from "@/config/product";
import { NONE } from "@/lib/billing/entitlement";
import { seatLimit } from "@/lib/billing/seats";
import { periodOf } from "@/lib/billing/usage";
import { claimCronRun } from "@/lib/cron/jobs";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { applyMailEvent } from "@/lib/delivery/events";
import { deliverPending, releaseHeld } from "@/lib/delivery/process";
import { handleFormPost } from "@/lib/forms/handler";
import { addRecipient, verifyRecipient } from "@/lib/forms/recipients";
import { createForm, ensureRecipient } from "@/lib/forms/store";
import type { Form, Recipient, Submission } from "@/lib/forms/types";
import type { MailMessage, MailTransport } from "@/lib/mail";
import { purgeExpired } from "@/lib/inbox/purge";
import { isPrivateIp, resolvesPublic } from "@/lib/webhooks/outbound";
import { webhookSlotAvailable } from "@/lib/webhooks/submissions";
import { GET as altchaGet, OPTIONS as altchaOptions } from "@/app/api/altcha/route";

// Regression tests for the pre-launch review (docs/REVIEW.md). Each one failed before its fix.

function fakeTransport() {
  const sent: (MailMessage & { id: string })[] = [];
  const t: MailTransport = {
    name: "fake",
    async send(msg) {
      const id = `msg_${sent.length + 1}`;
      sent.push({ ...msg, id });
      return { id, provider: "fake", accepted: true };
    },
  };
  return { t, sent };
}

let n = 0;
const ORG = "org_r";
let db: Db;
let form: Form;
let tx: ReturnType<typeof fakeTransport>;

async function submit(body: Record<string, string>) {
  const req = new Request(`http://localhost/f/${form.key}`, {
    method: "POST",
    body: new URLSearchParams(body),
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "x-forwarded-for": `10.9.${Math.floor(++n / 250)}.${n % 250}` },
  });
  const r = await handleFormPost(db, req, form.key, { transport: tx.t });
  await r.background?.();
  return r;
}
const allSubs = () => db.docs<Submission>("submissions").find({ orgId: ORG }, { sort: { receivedAt: 1 } });
const notifications = () => tx.sent.filter((m) => m.tags?.kind !== "usage_notice");

beforeEach(async () => {
  db = createMemoryDb("postslot");
  tx = fakeTransport();
  form = await createForm(db, { orgId: ORG, userEmail: "owner@studio.test", emailVerified: true }, "Contact", tx.t);
});

describe("P0: provider mail events are not lost when processing fails", () => {
  it("a bounce whose processing throws is applied when the provider retries it", async () => {
    await submit({ email: "a@visitor.test", message: "hello" });
    const addSuppression = db.addSuppression.bind(db);
    let failOnce = true;
    db.addSuppression = async (s) => {
      if (failOnce) { failOnce = false; throw new Error("mongo_blip"); }
      return addSuppression(s);
    };
    const bounce = { id: "evt_b1", messageId: "msg_1", type: "returned" as const, classification: "hard" as const, at: new Date(), recipient: "owner@studio.test" };
    await expect(applyMailEvent(db, bounce)).rejects.toThrow("mongo_blip");
    expect(await applyMailEvent(db, bounce)).toBe("applied"); // was "duplicate": the bounce was lost for good
    expect(await db.isSuppressed("owner@studio.test", `org:${ORG}`)).toBe(true);
    expect(await applyMailEvent(db, bounce)).toBe("duplicate");
  });

  it("an event for a message we do not know yet is processed when it arrives again", async () => {
    const accepted = { id: "evt_a1", messageId: "msg_1", type: "accepted" as const, at: new Date(Date.now() + 1000) };
    expect(await applyMailEvent(db, accepted)).toBe("unknown");
    await submit({ email: "a@visitor.test", message: "hello" });
    expect(await applyMailEvent(db, accepted)).toBe("applied");
    expect((await allSubs())[0]!.status).toBe("delivered");
  });
});

describe("P0: ALTCHA challenges can be fetched from a customer's site", () => {
  it("GET and preflight answer with CORS headers", async () => {
    const r = await altchaGet();
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(altchaOptions().headers.get("access-control-allow-methods")).toContain("GET");
  });
});

describe("P0: public claims match the code", () => {
  it("no plan lists a feature that is not built", () => {
    const text = product.plans.flatMap((p) => p.highlights).join(" ").toLowerCase();
    for (const missing of ["upload", "autorespond", "white label", "sending domain", "integration", "client workspace"]) expect(text).not.toContain(missing);
    expect(product.addOnsOnSale).toBe(false);
  });
});

describe("P1: metering and holds", () => {
  const overLimit = () => db.setEntitlement(ORG, { ...NONE(Date.now()), limitOverrides: { submissions: 1 } });

  it("the held meter counts a held submission once, not once per cron run", async () => {
    await overLimit();
    await submit({ message: "one" });
    await submit({ message: "two" });
    for (let i = 0; i < 3; i++) await deliverPending(db, { transport: tx.t });
    expect(await db.getUsage(ORG, "held", periodOf())).toBe(1);
  });

  it("two concurrent releases (cron and Stripe webhook) count and send a held submission once", async () => {
    await overLimit();
    await submit({ message: "one" });
    await submit({ message: "two" });
    await db.setEntitlement(ORG, { ...NONE(Date.now()), limitOverrides: { submissions: 10 } });
    await Promise.all([releaseHeld(db, ORG, { transport: tx.t }), releaseHeld(db, ORG, { transport: tx.t })]);
    expect(await db.getUsage(ORG, "submissions", periodOf())).toBe(2);
    expect(notifications()).toHaveLength(2);
  });

  it("submissions held for an unverified recipient go out once the form has a confirmed one, even without a link click", async () => {
    await db.setEntitlement(ORG, { ...NONE(Date.now()), limitOverrides: { recipients: 5 } });
    const owner = (await db.docs<Recipient>("recipients").findOne({ orgId: ORG }))!;
    const client = (await ensureRecipient(db, ORG, "client@agency.test", { transport: tx.t }))!;
    await db.docs<Form>("forms").update({ _id: form._id }, { recipientIds: [client._id] });
    await submit({ message: "waiting" });
    expect((await allSubs())[0]!.holdReason).toBe("recipient_unverified");
    await db.docs<Form>("forms").update({ _id: form._id }, { recipientIds: [client._id, owner._id] }); // owner re-adds their confirmed address
    const res = await deliverPending(db, { transport: tx.t });
    expect(res.unblocked).toBe(1);
    expect((await allSubs())[0]!.status).toBe("dispatched");
    expect(notifications().filter((m) => m.to === "owner@studio.test")).toHaveLength(1);
  });

  it("a held submission is dispatched once when the verify link and the cron run together", async () => {
    await db.docs<Form>("forms").update({ _id: form._id }, { recipientIds: [] });
    await db.setEntitlement(ORG, { ...NONE(Date.now()), limitOverrides: { recipients: 5 } });
    const r = (await addRecipient(db, ORG, "new@agency.test", { transport: tx.t }))!;
    await db.docs<Form>("forms").update({ _id: form._id }, { recipientIds: [r._id] });
    await submit({ message: "waiting" });
    const link = tx.sent.find((m) => m.to === "new@agency.test")!.text!;
    const token = /t=([\w-]+)/.exec(link)![1]!;
    await verifyRecipient(db, token, { transport: tx.t });
    await deliverPending(db, { transport: tx.t });
    expect(notifications().filter((m) => m.to === "new@agency.test" && m.tags?.submission)).toHaveLength(1);
  });
});

describe("P1: plan limits for seats and webhook endpoints", () => {
  it("seats come from the plan", async () => {
    expect(await seatLimit(db, ORG)).toBe(1);
    await db.setEntitlement(ORG, { ...NONE(Date.now()), isPaid: true, status: "active", plan: "pro", expiresAt: Date.now() + 30 * 864e5 });
    expect(await seatLimit(db, ORG)).toBe(3);
  });

  it("webhook endpoints are capped by the plan's integrations", async () => {
    expect(await webhookSlotAvailable(db, ORG)).toBe(false);
    await db.setEntitlement(ORG, { ...NONE(Date.now()), isPaid: true, status: "active", plan: "starter", expiresAt: Date.now() + 30 * 864e5 });
    expect(await webhookSlotAvailable(db, ORG)).toBe(true);
    await db.createWebhookEndpoint({ id: "ep1", orgId: ORG, url: "https://hooks.example.com/a", events: ["submission.received"], enabled: true, secret: "s" });
    expect(await webhookSlotAvailable(db, ORG)).toBe(false);
  });
});

describe("P1: cron overlap and webhook SSRF", () => {
  it("a second run of the same job inside the lock window is skipped", async () => {
    const t = 1_800_000_000_000;
    expect(await claimCronRun(db, "deliver-pending", t)).toBe(true);
    expect(await claimCronRun(db, "deliver-pending", t + 5_000)).toBe(false);
    expect(await claimCronRun(db, "retention-purge", t + 5_000)).toBe(true);
    expect(await claimCronRun(db, "deliver-pending", t + 60_000)).toBe(true);
  });

  it("webhook hosts that resolve to private addresses are refused", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:192.168.1.1", "0.0.0.0"]) expect(isPrivateIp(ip)).toBe(true);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
    expect(await resolvesPublic("evil.test", async () => [{ address: "93.184.216.34" }, { address: "10.0.0.5" }])).toBe(false);
    expect(await resolvesPublic("ok.test", async () => [{ address: "93.184.216.34" }])).toBe(true);
    expect(await resolvesPublic("nx.test", async () => { throw new Error("ENOTFOUND"); })).toBe(false);
  });
});

describe("P2: retention", () => {
  it("test submissions are purged after their 7 days, not kept for the plan's history", async () => {
    await submit({ message: "real" });
    const [real] = await allSubs();
    await db.docs<Submission>("submissions").insert({ ...real!, _id: "test_1", isTest: true, purgeAt: new Date(Date.now() + 7 * 864e5) });
    const res = await purgeExpired(db, new Date(Date.now() + 8 * 864e5));
    expect(res.deleted).toBe(1);
    expect((await allSubs()).map((s) => s._id)).toEqual([real!._id]);
  });
});
