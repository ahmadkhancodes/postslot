import { limitFor } from "@/lib/billing/entitlement";
import { periodOf } from "@/lib/billing/usage";
import type { Db } from "@/lib/db/types";
import type { Delivery } from "@/lib/forms/types";

export interface MonthUsage {
  period: string; // YYYY-MM
  /** Legitimate submissions counted against the plan. */
  submissions: number;
  /** Over the limit, waiting (never dropped). */
  held: number;
  /** Spam blocked. Never counted against the plan. */
  spam: number;
  /** Delivery outcomes for notifications created that month. */
  accepted: number;
  returned: number;
  pending: number;
}

export interface UsageReport {
  months: MonthUsage[];
  /** Submissions limit of the current plan (the same line is drawn across all months). */
  limit: number;
  current: MonthUsage;
}

/** The last `n` calendar months (UTC), oldest first, ending with the month of `now`. */
export function lastPeriods(now: Date, n = 12): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  return out;
}

export const periodRange = (p: string): { from: Date; to: Date } => {
  const [y, m] = p.split("-").map(Number) as [number, number];
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
};

export async function usageReport(db: Db, orgId: string, now = new Date()): Promise<UsageReport> {
  const deliveries = db.docs<Delivery>("deliveries");
  const periods = lastPeriods(now);
  const months = await Promise.all(periods.map(async (period): Promise<MonthUsage> => {
    const { from, to } = periodRange(period);
    const range = { createdAt: { $gte: from, $lt: to } };
    const [submissions, held, spam, accepted, returned, pending] = await Promise.all([
      db.getUsage(orgId, "submissions", period),
      db.getUsage(orgId, "held", period),
      db.getUsage(orgId, "spam", period),
      deliveries.count({ orgId, status: "accepted", ...range }),
      deliveries.count({ orgId, status: { $in: ["returned", "complaint", "blocked", "failed"] }, ...range }),
      deliveries.count({ orgId, status: { $in: ["queued", "dispatched", "deferred"] }, ...range }),
    ]);
    return { period, submissions, held, spam, accepted, returned, pending };
  }));
  const limit = limitFor(await db.getEntitlement(orgId), "submissions", now.getTime());
  return { months, limit, current: months[months.length - 1]! };
}

/** Round a chart maximum up to 1, 2, 2.5 or 5 times a power of ten so the axis ticks are readable. */
export function niceMax(v: number): number {
  if (v <= 0) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}
