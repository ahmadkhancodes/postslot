import { effectivePlan } from "@/lib/billing/entitlement";
import type { Db } from "@/lib/db/types";
import type { Delivery, DeliveryEvent, Submission } from "@/lib/forms/types";
import { retentionDays } from "./retention";

/** Deletes the submissions with these ids and everything hanging off them (deliveries, receipt events). */
async function deleteSubmissions(db: Db, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  await db.docs<Delivery>("deliveries").delete({ submissionId: { $in: ids } });
  await db.docs<DeliveryEvent>("delivery_events").delete({ submissionId: { $in: ids } });
  return db.docs<Submission>("submissions").delete({ _id: { $in: ids } });
}

export interface PurgeResult { deleted: number; kept: number; orgs: number }

/**
 * Cron `retention-purge`: deletes submissions past `purgeAt` (stamped at ingest from the plan's retention in product.ts) and writes one
 * audit entry per workspace. The workspace's CURRENT plan wins: if it upgraded since the row was stored, the row is kept and re-stamped,
 * so paying for longer history never loses data. Every row fetched is either deleted or pushed into the future, so a run always progresses.
 */
export async function purgeExpired(db: Db, now = new Date(), opts: { batch?: number; maxBatches?: number } = {}): Promise<PurgeResult> {
  const subs = db.docs<Submission>("submissions");
  const batch = opts.batch ?? 500;
  const perOrg = new Map<string, { deleted: number; days: number }>();
  const planDays = new Map<string, number>();
  let deleted = 0;
  let kept = 0;
  for (let i = 0; i < (opts.maxBatches ?? 10); i++) {
    const rows = await subs.find({ purgeAt: { $lt: now } }, { sort: { purgeAt: 1 }, limit: batch });
    if (!rows.length) break;
    const drop: Submission[] = [];
    for (const r of rows) {
      let days = planDays.get(r.orgId);
      if (days === undefined) planDays.set(r.orgId, (days = retentionDays(effectivePlan(await db.getEntitlement(r.orgId), now.getTime()).id)));
      const until = r.receivedAt.getTime() + days * 864e5;
      if (until > now.getTime()) {
        await subs.update({ _id: r._id }, { purgeAt: new Date(until) });
        kept++;
      } else drop.push(r);
    }
    const byOrg = new Map<string, string[]>();
    for (const r of drop) byOrg.set(r.orgId, [...(byOrg.get(r.orgId) ?? []), r._id]);
    for (const [orgId, ids] of byOrg) {
      const n = await deleteSubmissions(db, ids);
      deleted += n;
      const acc = perOrg.get(orgId) ?? { deleted: 0, days: planDays.get(orgId)! };
      acc.deleted += n;
      perOrg.set(orgId, acc);
    }
    if (rows.length < batch) break;
  }
  for (const [orgId, a] of perOrg) await db.appendAudit({ orgId, actorId: null, action: "retention.purged", meta: { deleted: a.deleted, retentionDays: a.days }, at: now });
  return { deleted, kept, orgs: perOrg.size };
}

/** "Delete all submissions" for one form, including spam and held. Audited. Usage already counted stays counted. */
export async function deleteAllSubmissions(db: Db, orgId: string, formId: string, actorId: string | null): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await db.docs<Submission>("submissions").find({ orgId, formId }, { limit: 500 });
    if (!rows.length) break;
    total += await deleteSubmissions(db, rows.map((r) => r._id));
  }
  await db.appendAudit({ orgId, actorId, action: "form.submissions_deleted", target: formId, meta: { deleted: total } });
  return total;
}
