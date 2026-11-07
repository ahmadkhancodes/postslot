import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import { retryableUnknown } from "@/lib/delivery/events";
import { checkHealth } from "@/lib/health";
import { recordCheck, runCanary, runProbe, summarizeStatus } from "@/lib/status";
import { install } from "@/content/docs/install";
import { product } from "@/config/product";
import { suppressionScope } from "@/lib/delivery/events";

describe("P1-9 provider event before the message id is saved", () => {
  const ev = (ageMs: number) => ({ id: "e", messageId: "m", type: "accepted" as const, at: new Date(Date.now() - ageMs) });
  it("asks the provider to retry a young unknown event, drops an old one", () => {
    expect(retryableUnknown([ev(5_000)], ["unknown"])).toBe(true);
    expect(retryableUnknown([ev(30 * 60_000)], ["unknown"])).toBe(false);
    expect(retryableUnknown([ev(5_000)], ["applied"])).toBe(false);
  });
});

describe("P1-10 account deletion", () => {
  it("removes audit entries, org suppressions and form-scoped spam words, keeps other orgs", async () => {
    const db = createMemoryDb("postslot");
    for (const org of ["o1", "o2"]) {
      await db.appendAudit({ orgId: org, actorId: "u", action: "x", ip: "1.2.3.4" });
      await db.addSuppression({ email: "a@b.test", reason: "bounce", scope: suppressionScope(org) });
      await db.docs<{ _id: string; orgId: string; scope: string; token: string; spam: number; ham: number }>("bayes_tokens").insert({ _id: `form:${org}|spam`, orgId: org, scope: `form:${org}`, token: "spam", spam: 1, ham: 0 });
    }
    await db.deleteOrgData("o1");
    expect(await db.listAudit("o1")).toEqual([]);
    expect(await db.isSuppressed("a@b.test", suppressionScope("o1"))).toBe(false);
    expect(await db.docs<{ _id: string; orgId: string }>("bayes_tokens").count({ orgId: "o1" })).toBe(0);
    expect((await db.listAudit("o2")).length).toBe(1);
    expect(await db.isSuppressed("a@b.test", suppressionScope("o2"))).toBe(true);
  });
});

describe("P1-11 health", () => {
  it("is ok with a reachable database", async () => {
    const r = await checkHealth(async () => createMemoryDb("postslot"));
    expect(r.ok).toBe(true);
  });
  it("is not ok when the database throws or hangs", async () => {
    expect((await checkHealth(async () => { throw new Error("down"); })).ok).toBe(false);
    expect((await checkHealth(() => new Promise(() => {}), 30)).ok).toBe(false);
  });
});

describe("status", () => {
  it("probe and canary write uptime_checks, summary shows uptime and latest state", async () => {
    const db = createMemoryDb("postslot");
    const okFetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    await runProbe(db, { fetch: okFetch, baseUrl: "http://x" });
    await recordCheck(db, { kind: "probe", ok: false, ms: 10, detail: "boom", at: new Date(Date.now() - 1000) });
    await runCanary(db, { fetch: (async () => new Response("", { status: 500 })) as typeof fetch, baseUrl: "http://x" });
    const s = await summarizeStatus(db);
    expect(s.days.length).toBe(90);
    expect(s.total).toBe(3);
    expect(s.uptimePct).toBeCloseTo(33.3, 0);
    expect(s.current).toBe("down");
    expect((await summarizeStatus(createMemoryDb("postslot"))).current).toBe("unknown");
  });
});

describe("AI builder prompts", () => {
  const sections = install.sections.filter((s) => ["Lovable", "Bolt", "v0", "Claude Code"].includes(s.heading));
  it("has four prompts that say where to paste the key and never claim it is pre-filled", () => {
    expect(sections.length).toBe(4);
    for (const s of sections) {
      expect(s.code?.code).toContain(`${product.url}/f/`);
      expect(s.code?.code).toMatch(/paste/i);
      expect(JSON.stringify(s)).not.toMatch(/pre-?filled|already filled|filled in for you/i);
    }
  });
});
