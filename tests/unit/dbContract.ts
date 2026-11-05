import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/types";
import { NONE } from "@/lib/billing/entitlement";

// Shared contract suite (ported from trayo server/__tests__/dbContract.ts, sync/family/merge removed).
// Run against memory always, and against Mongo when MONGODB_URI_TEST is set.
export function dbContract(name: string, make: () => Promise<Db>) {
  describe(`Db contract: ${name}`, () => {
    it("billing accounts are found by Stripe customer", async () => {
      const db = await make();
      await db.upsertBillingAccount({ id: "org_a", stripeCustomerId: "cus_1", email: "a@x.test" });
      expect((await db.findBillingAccountByCustomer("cus_1"))?.id).toBe("org_a");
      expect(await db.findBillingAccountByCustomer("cus_nope")).toBeNull();
      expect((await db.getBillingAccount("org_a"))?.createdAt).toBeInstanceOf(Date);
    });

    it("entitlements round trip", async () => {
      const db = await make();
      const e = { ...NONE(1), isPaid: true, status: "active" as const, plan: "pro" as const };
      await db.setEntitlement("org_e", e);
      expect(await db.getEntitlement("org_e")).toEqual(e);
    });

    it("stripe events: recorded only via markStripeEvent, once", async () => {
      const db = await make();
      const id = `evt_${Math.random()}`;
      expect(await db.hasStripeEvent(id)).toBe(false);
      expect(await db.markStripeEvent(id, "x")).toBe(true);
      expect(await db.markStripeEvent(id, "x")).toBe(false);
      expect(await db.hasStripeEvent(id)).toBe(true);
    });

    it("usage counters increment atomically per period", async () => {
      const db = await make();
      const org = `org_u${Math.random()}`;
      expect(await db.incUsage(org, "submissions", "2026-11")).toBe(1);
      expect(await db.incUsage(org, "submissions", "2026-11", 4)).toBe(5);
      expect(await db.getUsage(org, "submissions", "2026-12")).toBe(0);
    });

    it("sliding-window rate limit drops old hits", async () => {
      const db = await make();
      const k = `rl_${Math.random()}`;
      expect(await db.hitRateLimit(k, 1000, 10_000)).toBe(1);
      expect(await db.hitRateLimit(k, 1000, 10_500)).toBe(2);
      expect(await db.hitRateLimit(k, 1000, 11_200)).toBe(2); // the 10_000 hit fell out
    });

    it("audit log is append-only and ordered newest first", async () => {
      const db = await make();
      const org = `org_${Math.random()}`;
      await db.appendAudit({ orgId: org, actorId: "u1", action: "a.one", at: new Date(1000) });
      await db.appendAudit({ orgId: org, actorId: "u1", action: "a.two", at: new Date(2000) });
      const list = await db.listAudit(org);
      expect(list.map((x) => x.action)).toEqual(["a.two", "a.one"]);
      expect((await db.listAudit(org, { before: new Date(1500) })).map((x) => x.action)).toEqual(["a.one"]);
    });

    it("webhook endpoints are scoped to their org; due deliveries are found", async () => {
      const db = await make();
      const org = `org_${Math.random()}`;
      await db.createWebhookEndpoint({ id: `ep_${org}`, orgId: org, url: "https://x.test/h", secret: "whsec_1", events: ["*"], enabled: true });
      expect(await db.getWebhookEndpoint("someone_else", `ep_${org}`)).toBeNull();
      const now = new Date();
      await db.createDelivery({
        id: `d_${org}`, orgId: org, endpointId: `ep_${org}`, event: "x", payload: "{}", status: "retrying", attempts: 1,
        nextAttemptAt: new Date(now.getTime() - 1000), lastStatusCode: 500, lastError: "http_500", createdAt: now, updatedAt: now,
        expireAt: new Date(now.getTime() + 864e5),
      });
      expect((await db.dueDeliveries(now, 10)).some((d) => d.id === `d_${org}`)).toBe(true);
      expect((await db.getDelivery(org, `d_${org}`))?.expireAt).toBeInstanceOf(Date); // TTL field is a Date
    });

    it("suppression list: all-scope blocks every scope", async () => {
      const db = await make();
      const e = `User${Math.random()}@X.test`;
      await db.addSuppression({ email: e, scope: "marketing", reason: "unsubscribe" });
      expect(await db.isSuppressed(e.toLowerCase(), "marketing")).toBe(true);
      expect(await db.isSuppressed(e, "notification")).toBe(false);
      await db.addSuppression({ email: e, scope: "all", reason: "complaint" });
      expect(await db.isSuppressed(e, "notification")).toBe(true);
    });

    it("deleteOrgData removes billing + webhooks but keeps the audit log", async () => {
      const db = await make();
      const org = `org_${Math.random()}`;
      await db.upsertBillingAccount({ id: org, stripeCustomerId: `cus_${org}`, email: null });
      await db.setEntitlement(org, NONE(1));
      await db.createWebhookEndpoint({ id: `ep2_${org}`, orgId: org, url: "https://x.test", secret: "s", events: ["*"], enabled: true });
      await db.appendAudit({ orgId: org, actorId: null, action: "x" });
      const exported = await db.exportOrgData(org);
      expect(JSON.stringify(exported)).not.toContain('"secret"');
      await db.deleteOrgData(org);
      expect(await db.getBillingAccount(org)).toBeNull();
      expect(await db.getEntitlement(org)).toBeNull();
      expect(await db.listWebhookEndpoints(org)).toEqual([]);
      expect((await db.listAudit(org)).length).toBe(1);
    });

    it("config round trip", async () => {
      const db = await make();
      await db.setConfig("payments_enabled", "off");
      expect((await db.getConfig()).payments_enabled).toBe("off");
    });

    it("doc store: insert, filters, sort, update, inc, upsert, delete", async () => {
      const db = await make();
      const col = db.docs<{ _id: string; orgId: string; n: number; at: Date; text?: string; tags?: string[] }>(`t_${Math.random().toString(36).slice(2)}`);
      expect(await col.insert({ _id: "a", orgId: "o", n: 1, at: new Date(1000), text: "Hello World" })).toBe(true);
      expect(await col.insert({ _id: "a", orgId: "o", n: 9, at: new Date(0) })).toBe(false); // duplicate _id
      await col.insert({ _id: "b", orgId: "o", n: 2, at: new Date(2000), text: "other", tags: ["x", "y"] });
      await col.insert({ _id: "c", orgId: "p", n: 3, at: new Date(3000) });
      expect((await col.get("a"))?.text).toBe("Hello World");
      expect((await col.get("a")) as object).not.toHaveProperty("app");
      expect((await col.find({ orgId: "o" }, { sort: { at: -1 } })).map((d) => d._id)).toEqual(["b", "a"]);
      expect((await col.find({ _id: { $in: ["a", "c"] } }, { sort: { n: 1 } })).map((d) => d._id)).toEqual(["a", "c"]);
      expect((await col.find({ at: { $lt: new Date(2000) } })).map((d) => d._id)).toEqual(["a"]);
      expect((await col.find({ n: { $gte: 2 }, orgId: "o" })).map((d) => d._id)).toEqual(["b"]);
      expect((await col.find({ orgId: "o", _id: { $ne: "a" } })).map((d) => d._id)).toEqual(["b"]);
      expect((await col.find({ text: { $contains: "hello w" } })).map((d) => d._id)).toEqual(["a"]);
      expect((await col.find({ text: { $contains: "(" } })).length).toBe(0); // regex characters are literal
      expect((await col.find({ tags: "y" })).map((d) => d._id)).toEqual(["b"]);
      expect(await col.count({ orgId: "o" })).toBe(2);
      expect(await col.update({ _id: "a" }, { text: "changed" }, { inc: { n: 5 } })).toBe(1);
      expect(await col.get("a")).toMatchObject({ text: "changed", n: 6 });
      expect(await col.update({ _id: "z" }, { orgId: "o" }, { inc: { n: 2 }, upsert: true })).toBe(1);
      expect(await col.get("z")).toMatchObject({ orgId: "o", n: 2 });
      expect(await col.update({ _id: "a" }, { text: undefined })).toBe(1);
      expect(await col.get("a")).not.toHaveProperty("text");
      expect(await col.update({ _id: "nope" }, { text: "x" })).toBe(0);
      expect(await col.delete({ orgId: "o" })).toBe(3);
      expect(await col.count({})).toBe(1);
    });

    it("org export and delete cover Postslot collections", async () => {
      const db = await make();
      await db.docs("forms").insert({ _id: "f1", orgId: "org_x", name: "A" } as never);
      await db.docs("recipients").insert({ _id: "org_x|a@b.co", orgId: "org_x", email: "a@b.co", verifyTokenHash: "secret" } as never);
      const exp = (await db.exportOrgData("org_x")) as { forms: unknown[]; recipients: object[] };
      expect(exp.forms).toHaveLength(1);
      expect(exp.recipients[0]).not.toHaveProperty("verifyTokenHash");
      await db.deleteOrgData("org_x");
      expect(await db.docs("forms").count({ orgId: "org_x" })).toBe(0);
      expect(await db.docs("recipients").count({ orgId: "org_x" })).toBe(0);
    });
  });
}
