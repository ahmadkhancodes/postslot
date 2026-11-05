import { getDb } from "@/lib/db";
import type { Db } from "@/lib/db/types";
import { deliverPending } from "@/lib/delivery/process";
import { purgeExpired } from "@/lib/inbox/purge";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  "deliver-pending": async () => deliverPending(await getDb()),
  "retention-purge": async () => purgeExpired(await getDb()),
  /** Daily Vercel Cron fallback (Hobby allows two daily crons): webhook retries and the retention purge, so retention runs even without the worker. */
  maintenance: async () => ({ webhooks: await retryDueDeliveries({ limit: 100 }), purge: await purgeExpired(await getDb()) }),
  heartbeat: async () => ({ at: new Date().toISOString() }),
};

/** A run of the same job inside this window is skipped (the per-minute worker and Vercel Cron can overlap). */
export const CRON_LOCK_MS = 50_000;

/** True when this call may run `job` now; false when another run started less than CRON_LOCK_MS ago. */
export async function claimCronRun(db: Db, job: string, now = Date.now()): Promise<boolean> {
  return (await db.hitRateLimit(`cron-lock:${job}`, CRON_LOCK_MS, now)) <= 1;
}
