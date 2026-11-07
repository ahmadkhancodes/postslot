import { getDb } from "@/lib/db";
import type { Db } from "@/lib/db/types";
import { checkHealth } from "@/lib/health";
import { uuidv7 } from "@/lib/ids";
import { appUrl } from "@/lib/env";

export type CheckKind = "probe" | "canary";
export interface UptimeCheck { _id: string; kind: CheckKind; ok: boolean; ms: number; detail?: string; at: Date; expireAt: Date }

const KEEP_DAYS = 90;
const DAY = 864e5;

export async function recordCheck(db: Db, c: { kind: CheckKind; ok: boolean; ms: number; detail?: string; at?: Date }): Promise<void> {
  const at = c.at ?? new Date();
  await db.docs<UptimeCheck>("uptime_checks").insert({ _id: uuidv7(at.getTime()), kind: c.kind, ok: c.ok, ms: c.ms, detail: c.detail, at, expireAt: new Date(at.getTime() + KEEP_DAYS * DAY) });
}

interface ProbeDeps { fetch?: typeof fetch; baseUrl?: string }

async function timed(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<{ status: number; ms: number }> {
  const started = Date.now();
  const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(8000), redirect: "manual", cache: "no-store" });
  return { status: res.status, ms: Date.now() - started };
}

/** Cheap probe: database ping plus the public health endpoint. Run often by the cron worker. */
export async function runProbe(db: Db, deps: ProbeDeps = {}): Promise<{ ok: boolean }> {
  const fetcher = deps.fetch ?? fetch;
  const base = deps.baseUrl ?? appUrl();
  const started = Date.now();
  let detail: string | undefined;
  const h = await checkHealth(async () => db);
  if (!h.ok) detail = h.error;
  else {
    try {
      const r = await timed(fetcher, `${base}/api/health`);
      if (r.status !== 200) detail = `health_${r.status}`;
    } catch {
      detail = "health_unreachable";
    }
  }
  const ok = !detail;
  await recordCheck(db, { kind: "probe", ok, ms: Date.now() - started, detail });
  return { ok };
}

/** Daily canary: the public paths a customer touches must answer as expected (landing page, challenge, ingest rejects an unknown key). */
export async function runCanary(db: Db, deps: ProbeDeps = {}): Promise<{ ok: boolean; failed: string[] }> {
  const fetcher = deps.fetch ?? fetch;
  const base = deps.baseUrl ?? appUrl();
  const started = Date.now();
  const failed: string[] = [];
  const expect = async (name: string, path: string, want: (s: number) => boolean, init?: RequestInit) => {
    try {
      const r = await timed(fetcher, `${base}${path}`, init);
      if (!want(r.status)) failed.push(`${name}:${r.status}`);
    } catch {
      failed.push(`${name}:unreachable`);
    }
  };
  await expect("health", "/api/health", (s) => s === 200);
  await expect("landing", "/", (s) => s === 200);
  await expect("docs", "/docs/install", (s) => s === 200);
  await expect("script", "/ps.js", (s) => s === 200);
  await expect("ingest", "/f/canary-no-such-key", (s) => s === 404 || s === 400, { method: "POST", body: new URLSearchParams({ email: "canary@example.com" }), headers: { accept: "application/json" } });
  await recordCheck(db, { kind: "canary", ok: failed.length === 0, ms: Date.now() - started, detail: failed.join(",") || undefined });
  return { ok: failed.length === 0, failed };
}

export interface DayStatus { date: string; checks: number; failed: number }
export interface StatusSummary { days: DayStatus[]; total: number; failed: number; uptimePct: number | null; current: "up" | "down" | "unknown"; lastAt: Date | null; lastCanary: { ok: boolean; at: Date } | null; avgMs: number | null }

export async function summarizeStatus(db: Db, now = Date.now()): Promise<StatusSummary> {
  const since = new Date(now - KEEP_DAYS * DAY);
  const rows = await db.docs<UptimeCheck>("uptime_checks").find({ at: { $gte: since } }, { sort: { at: -1 }, limit: 20000 });
  const byDay = new Map<string, DayStatus>();
  for (let i = KEEP_DAYS - 1; i >= 0; i--) {
    const date = new Date(now - i * DAY).toISOString().slice(0, 10);
    byDay.set(date, { date, checks: 0, failed: 0 });
  }
  for (const r of rows) {
    const d = byDay.get(r.at.toISOString().slice(0, 10));
    if (!d) continue;
    d.checks++;
    if (!r.ok) d.failed++;
  }
  const failed = rows.filter((r) => !r.ok).length;
  const canary = rows.find((r) => r.kind === "canary");
  const probes = rows.filter((r) => r.kind === "probe");
  return {
    days: [...byDay.values()],
    total: rows.length,
    failed,
    uptimePct: rows.length ? Math.round(((rows.length - failed) / rows.length) * 1000) / 10 : null,
    current: rows.length ? (rows[0]!.ok ? "up" : "down") : "unknown",
    lastAt: rows[0]?.at ?? null,
    lastCanary: canary ? { ok: canary.ok, at: canary.at } : null,
    avgMs: probes.length ? Math.round(probes.reduce((a, r) => a + r.ms, 0) / probes.length) : null,
  };
}

export const loadStatus = async () => summarizeStatus(await getDb());
