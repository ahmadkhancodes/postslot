import { getDb } from "@/lib/db";
import { deliverPending } from "@/lib/delivery/process";
import { purgeExpired } from "@/lib/inbox/purge";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  "deliver-pending": async () => deliverPending(await getDb()),
  "retention-purge": async () => purgeExpired(await getDb()),
  heartbeat: async () => ({ at: new Date().toISOString() }),
};
