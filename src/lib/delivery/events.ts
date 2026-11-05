import { DELIVERY_TTL_DAYS } from "@/lib/db/types";
import type { Db } from "@/lib/db/types";
import { uuidv7 } from "@/lib/ids";
import type { Delivery, DeliveryEvent, DeliveryEventType, Recipient, Submission } from "@/lib/forms/types";
import type { MailEvent } from "@/lib/mail/events";
import { emitSubmissionEvent, type EmitDeps } from "@/lib/webhooks/submissions";
import type { Form } from "@/lib/forms/types";

export const suppressionScope = (orgId: string) => `org:${orgId}`;

export async function recordEvent(db: Db, e: { orgId: string; submissionId: string; deliveryId?: string; type: DeliveryEventType; at?: Date; detail?: string }): Promise<DeliveryEvent> {
  const at = e.at ?? new Date();
  const ev: DeliveryEvent = { _id: uuidv7(at.getTime()), orgId: e.orgId, submissionId: e.submissionId, deliveryId: e.deliveryId, type: e.type, at, detail: e.detail, expireAt: new Date(at.getTime() + DELIVERY_TTL_DAYS * 864e5) };
  await db.docs<DeliveryEvent>("delivery_events").insert(ev);
  return ev;
}

const RANK: Record<Delivery["status"], number> = { queued: 0, dispatched: 1, deferred: 2, accepted: 3, returned: 4, complaint: 4, blocked: 4, failed: 4 };

/** Submission status from all of its deliveries: any accepted wins, then any returned/complaint, else unchanged. */
export async function recomputeSubmissionStatus(db: Db, submissionId: string, deps: EmitDeps = {}): Promise<void> {
  const sub = await db.docs<Submission>("submissions").get(submissionId);
  if (!sub || ["quarantined", "held", "received", "sorted"].includes(sub.status)) return;
  const ds = await db.docs<Delivery>("deliveries").find({ submissionId });
  let next: Submission["status"] | null = null;
  if (ds.some((d) => d.status === "accepted")) next = "delivered";
  else if (ds.length && ds.every((d) => ["returned", "complaint", "blocked", "failed"].includes(d.status))) next = ds.some((d) => d.status === "failed") && !ds.some((d) => d.status === "returned" || d.status === "complaint") ? "failed" : "returned";
  else if (ds.some((d) => d.status === "dispatched" || d.status === "deferred" || d.status === "queued")) next = "dispatched";
  if (next && next !== sub.status) {
    await db.docs<Submission>("submissions").update({ _id: submissionId }, { status: next });
    // Outbound webhooks: only on a change, so retries and duplicate provider events do not repeat them.
    const event = next === "delivered" ? "submission.delivered" : next === "returned" || next === "failed" ? "submission.bounced" : null;
    const form = event && (await db.docs<Form>("forms").get(sub.formId));
    if (event && form) await emitSubmissionEvent(db, form, { ...sub, status: next }, event, deps);
  }
}

export type ApplyResult = "applied" | "duplicate" | "unknown" | "ignored";

/**
 * Applies one normalised MailEvent: idempotent by event id, updates the delivery, its timeline, the submission status
 * and the suppression list (hard bounces and complaints). Never moves a delivery backwards (deferred after accepted).
 */
export async function applyMailEvent(db: Db, ev: MailEvent, deps: EmitDeps = {}): Promise<ApplyResult> {
  if (ev.type === "dispatched") return "ignored"; // we write our own dispatched stamp when we hand the message over
  const key = ev.id ?? `${ev.messageId}|${ev.type}|${ev.at.getTime()}`;
  const fresh = await db.docs<{ _id: string; at: Date; expireAt: Date }>("mail_inbound_events").insert({ _id: key, at: new Date(), expireAt: new Date(Date.now() + 7 * 864e5) });
  if (!fresh) return "duplicate";
  const deliveries = db.docs<Delivery>("deliveries");
  const d = await deliveries.findOne({ mailerMessageId: ev.messageId });
  if (!d) return "unknown";

  // returned + soft = the recipient server asked to retry, same as deferred.
  const soft = ev.type === "returned" && ev.classification === "soft";
  const type: DeliveryEventType = soft ? "deferred" : ev.type;
  await recordEvent(db, { orgId: d.orgId, submissionId: d.submissionId, deliveryId: d._id, type, at: ev.at, detail: ev.detail });

  const status: Delivery["status"] = type === "accepted" ? "accepted" : type === "deferred" ? "deferred" : type === "complaint" ? "complaint" : "returned";
  if (RANK[status] >= RANK[d.status]) await deliveries.update({ _id: d._id }, { status, lastEventAt: ev.at });

  const suppress = (ev.type === "returned" && !soft && ev.classification !== "block") || ev.type === "complaint";
  if (suppress) {
    const email = (ev.recipient ?? d.recipientEmail).toLowerCase();
    await db.addSuppression({ email, reason: ev.type === "complaint" ? "complaint" : "bounce", scope: suppressionScope(d.orgId) });
    await db.docs<Recipient>("recipients").update({ _id: `${d.orgId}|${email}` }, { bouncedAt: ev.at, bounceDetail: (ev.detail ?? (ev.type === "complaint" ? "marked as spam by the recipient" : "address rejected")).slice(0, 300) });
  }
  await recomputeSubmissionStatus(db, d.submissionId, deps);
  return "applied";
}
