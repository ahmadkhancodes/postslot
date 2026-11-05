import { log } from "@/lib/logger";
import { uuidv7 } from "@/lib/ids";
import { sendMail, transportFromEnv, type MailTransport } from "@/lib/mail";
import type { Db } from "@/lib/db/types";
import type { Delivery, Form, Recipient, Submission } from "@/lib/forms/types";
import { applyMailEvent, recomputeSubmissionStatus, recordEvent, suppressionScope } from "./events";
import { renderNotification } from "./templates";

export interface Deps { transport?: MailTransport; now?: () => Date }

/** Retry backoff after a failed hand-over to the mail provider: 1 min, 5 min, 30 min, 2 h, 6 h, then give up. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
export const backoffFor = (attempts: number) => BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]!;

const nowOf = (d: Deps) => (d.now ?? (() => new Date()))();

export async function verifiedRecipients(db: Db, form: Pick<Form, "recipientIds">): Promise<Recipient[]> {
  if (!form.recipientIds.length) return [];
  const rs = await db.docs<Recipient>("recipients").find({ _id: { $in: form.recipientIds } });
  return rs.filter((r) => r.verifiedAt);
}

/** Hands one delivery to the Mailer. Failure keeps it queued with backoff; the cron job `deliver-pending` retries. */
export async function sendDelivery(db: Db, form: Form, sub: Submission, d: Delivery, deps: Deps = {}): Promise<Delivery["status"]> {
  const deliveries = db.docs<Delivery>("deliveries");
  const transport = deps.transport ?? transportFromEnv();
  const at = nowOf(deps);
  const mail = renderNotification(form, sub);
  try {
    const r = await sendMail(
      {
        to: d.recipientEmail, ...mail, replyTo: sub.replyTo, category: "transactional",
        tags: { form: form._id, submission: sub._id },
        headers: { "Feedback-ID": `${form._id}:${sub.orgId}:postslot` },
      },
      transport,
    );
    const attempts = d.attempts + 1;
    await deliveries.update({ _id: d._id }, { status: "dispatched", mailerMessageId: r.id, attempts, lastEventAt: at, nextAttemptAt: undefined, lastError: undefined });
    await recordEvent(db, { orgId: d.orgId, submissionId: sub._id, deliveryId: d._id, type: "dispatched", at, detail: `handed to ${r.provider}` });
    // The console provider has no event feed: it plays the recipient server and accepts immediately.
    if (r.provider === "console") await applyMailEvent(db, { id: `console:${r.id}`, messageId: r.id, type: "accepted", at: new Date(at.getTime() + 1), recipient: d.recipientEmail });
    return "dispatched";
  } catch (e) {
    const attempts = d.attempts + 1;
    const message = (e as Error).message.slice(0, 200);
    log.warn("delivery_send_failed", { submission: sub._id, attempts, message });
    if (attempts >= MAX_ATTEMPTS) {
      await deliveries.update({ _id: d._id }, { status: "failed", attempts, lastError: message, lastEventAt: at });
      await recordEvent(db, { orgId: d.orgId, submissionId: sub._id, deliveryId: d._id, type: "expired", at, detail: `gave up after ${attempts} attempts: ${message}` });
      await recomputeSubmissionStatus(db, sub._id);
      return "failed";
    }
    await deliveries.update({ _id: d._id }, { status: "queued", attempts, lastError: message, nextAttemptAt: new Date(at.getTime() + backoffFor(attempts)), lastEventAt: at });
    return "queued";
  }
}

/**
 * Sends the notification to every verified recipient of the form. Suppressed recipients get a `blocked` delivery.
 * Returns false when nobody is verified yet (caller holds the submission; an unverified address never gets content).
 */
export async function dispatchSubmission(db: Db, form: Form, sub: Submission, deps: Deps = {}): Promise<boolean> {
  const recipients = await verifiedRecipients(db, form);
  if (!recipients.length) return false;
  const at = nowOf(deps);
  for (const r of recipients) {
    const d: Delivery = { _id: uuidv7(at.getTime()), orgId: sub.orgId, submissionId: sub._id, recipientId: r._id, recipientEmail: r.email, channel: "email", status: "queued", attempts: 0, lastEventAt: at, createdAt: at };
    await db.docs<Delivery>("deliveries").insert(d);
    if (await db.isSuppressed(r.email, suppressionScope(sub.orgId))) {
      await db.docs<Delivery>("deliveries").update({ _id: d._id }, { status: "blocked" });
      await recordEvent(db, { orgId: sub.orgId, submissionId: sub._id, deliveryId: d._id, type: "blocked", at, detail: `${r.email} is on the suppression list after a bounce or complaint` });
      continue;
    }
    await sendDelivery(db, form, sub, d, deps);
  }
  await db.docs<Submission>("submissions").update({ _id: sub._id }, { status: "dispatched", holdReason: undefined });
  await recomputeSubmissionStatus(db, sub._id);
  return true;
}

/** Retries queued deliveries whose backoff has passed. */
export async function retryQueued(db: Db, deps: Deps = {}, limit = 100): Promise<number> {
  const now = nowOf(deps);
  const due = await db.docs<Delivery>("deliveries").find({ status: "queued", nextAttemptAt: { $lte: now } }, { limit, sort: { nextAttemptAt: 1 } });
  let n = 0;
  for (const d of due) {
    const sub = await db.docs<Submission>("submissions").get(d.submissionId);
    const form = sub && (await db.docs<Form>("forms").get(sub.formId));
    if (!sub || !form) { await db.docs<Delivery>("deliveries").update({ _id: d._id }, { status: "failed", lastError: "submission_gone" }); continue; }
    await sendDelivery(db, form, sub, d, deps);
    await recomputeSubmissionStatus(db, sub._id);
    n++;
  }
  return n;
}
