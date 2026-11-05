import { limitFor } from "./entitlement";
import { periodOf } from "./usage";
import type { Db } from "@/lib/db/types";

/**
 * Soft cap (docs/brief.md): count one legitimate submission on this month's meter and say whether it fits the plan.
 * Over the limit it is NOT counted and NOT dropped: the caller holds it. Spam and test submissions never call this.
 */
export async function admit(db: Db, orgId: string, now = new Date()): Promise<boolean> {
  const ent = await db.getEntitlement(orgId);
  const limit = limitFor(ent, "submissions", now.getTime());
  const period = periodOf(now);
  const used = await db.incUsage(orgId, "submissions", period, 1);
  if (used <= limit) return true;
  await db.incUsage(orgId, "submissions", period, -1);
  return false;
}

export const countSpam = (db: Db, orgId: string, now = new Date()) => db.incUsage(orgId, "spam", periodOf(now), 1);
export const countHeld = (db: Db, orgId: string, now = new Date()) => db.incUsage(orgId, "held", periodOf(now), 1);
