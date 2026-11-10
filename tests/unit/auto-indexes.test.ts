import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureIndexesOn, scheduleEnsureIndexes } from "@/lib/db/mongo";

const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => {
  globalThis.__kitIndexes = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("auto indexes", () => {
  it("runs once and not again on a second call", async () => {
    const run = vi.fn().mockResolvedValue(1);
    scheduleEnsureIndexes("k", run);
    scheduleEnsureIndexes("k", run);
    await flush();
    scheduleEnsureIndexes("k", run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("is skipped during next build", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const run = vi.fn();
    scheduleEnsureIndexes("k", run);
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("an error is logged scrubbed, does not throw, and retries next time", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn().mockRejectedValueOnce(new Error("bad mongodb+srv://u:pw@host/db")).mockResolvedValue(1);
    expect(() => scheduleEnsureIndexes("k", run)).not.toThrow();
    await flush();
    expect(warn.mock.calls[0][0]).not.toContain("pw@");
    scheduleEnsureIndexes("k", run);
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("index option conflicts are logged, other errors thrown", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls: string[] = [];
    const mk = (code: number) => ({ collection: (n: string) => ({ createIndex: async () => { calls.push(n); throw Object.assign(new Error("x"), { code }); } }) });
    await expect(ensureIndexesOn(mk(85))).resolves.toBeDefined();
    expect(calls.length).toBeGreaterThan(20);
    await expect(ensureIndexesOn(mk(13))).rejects.toThrow();
  });
});

describe("getDb", () => {
  it("memory driver never schedules, and mongo getDb returns without waiting for indexes", async () => {
    vi.resetModules();
    const sched = vi.fn();
    vi.doMock("@/lib/db/mongo", () => ({ createMongoDb: () => ({ app: "x" }), scheduleEnsureIndexes: sched, ensureIndexes: () => new Promise(() => {}) }));
    vi.stubEnv("MONGODB_URI", "");
    const { getDb } = await import("@/lib/db");
    await getDb();
    expect(sched).not.toHaveBeenCalled();
    vi.stubEnv("MONGODB_URI", "mongodb://localhost/x");
    vi.stubEnv("DB_DRIVER", "mongo");
    const m = await import("@/lib/db");
    await m.getDb();
    expect(sched).toHaveBeenCalledTimes(1);
    vi.doUnmock("@/lib/db/mongo");
  });
});
