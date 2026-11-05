import { admit, countHeld, countSpam } from "@/lib/billing/softcap";
import type { Db } from "@/lib/db/types";
import type { Form, Submission } from "@/lib/forms/types";
import { train } from "@/lib/spam/bayes";
import { scoreSubmission } from "@/lib/spam/score";
import { periodOf } from "@/lib/billing/usage";
import { dispatchSubmission, retryQueued, type Deps } from "./dispatch";
import { recomputeSubmissionStatus, recordEvent, suppressionScope } from "./events";
import type { Delivery, Recipient } from "@/lib/forms/types";
import { log } from "@/lib/logger";
import { checkSpamBurst, checkUsageNotices } from "@/lib/notices";
import { emitSubmissionEvent } from "@/lib/webhooks/submissions";

const soft = <T,>(p: Promise<T>, what: string) => p.catch((e) => { log.warn(`${what}_failed`, { message: (e as Error).message }); return undefined; });

const subs = (db: Db) => db.docs<Submission>("submissions");

/** Dispatch to verified recipients, or hold (recipient_unverified) until the address is confirmed. */
async function dispatchOrHold(db: Db, form: Form, sub: Submission, deps: Deps): Promise<Submission> {
  const sent = await dispatchSubmission(db, form, sub, deps);
  if (sent) await subs(db).update({ _id: sub._id }, { holdReason: undefined });
  else {
    await subs(db).update({ _id: sub._id }, { status: "held", holdReason: "recipient_unverified" });
    if (sub.status !== "held") await emitSubmissionEvent(db, form, { ...sub, status: "held", holdReason: "recipient_unverified" }, "submission.held", deps);
  }
  return (await subs(db).get(sub._id))!;
}

/** Counts a legitimate submission on the meter; over the plan it is held (never rejected, never counted). */
async function meterAndRoute(db: Db, form: Form, sub: Submission, deps: Deps): Promise<Submission> {
  const now = deps.now?.() ?? new Date();
  if (!sub.isTest && !sub.metered) {
    if (!(await admit(db, sub.orgId, now))) {
      await countHeld(db, sub.orgId, now);
      await subs(db).update({ _id: sub._id }, { status: "held", holdReason: "over_limit" });
      await soft(checkUsageNotices(db, sub.orgId, deps), "usage_notice");
      // The cron retries held rows every minute: announce the hold once, when the submission first becomes held.
      if (sub.status !== "held") await emitSubmissionEvent(db, form, { ...sub, status: "held", holdReason: "over_limit" }, "submission.held", deps);
      return (await subs(db).get(sub._id))!;
    }
    await subs(db).update({ _id: sub._id }, { metered: true });
    sub = { ...sub, metered: true };
    await soft(checkUsageNotices(db, sub.orgId, deps), "usage_notice");
  }
  return dispatchOrHold(db, form, { ...sub, holdReason: undefined }, deps);
}

/** Content scoring, sorting, metering and dispatch for a stored `received` submission. Safe to call twice. */
export async function processSubmission(db: Db, id: string, deps: Deps = {}): Promise<Submission | null> {
  const sub = await subs(db).get(id);
  if (!sub || sub.status !== "received") return sub;
  const form = await db.docs<Form>("forms").get(sub.formId);
  if (!form) return sub;
  const now = deps.now?.() ?? new Date();
  const v = await scoreSubmission(db, form, sub);
  await subs(db).update({ _id: id }, { signals: v.signals, spamScore: v.score, scored: v.scored, sortedAt: now });
  const sorted = { ...sub, signals: v.signals, spamScore: v.score, scored: v.scored, sortedAt: now };
  if (v.spam) {
    await subs(db).update({ _id: id }, { status: "quarantined" });
    await countSpam(db, sub.orgId, now);
    await soft(checkSpamBurst(db, form, deps), "spam_burst");
    await recordEvent(db, { orgId: sub.orgId, submissionId: id, type: "sorted", at: now, detail: `quarantined as spam (${v.signals.filter((s) => s.weight > 0).map((s) => s.name).join(", ") || "score"})` });
    return (await subs(db).get(id))!;
  }
  await subs(db).update({ _id: id }, { status: "sorted" });
  await recordEvent(db, { orgId: sub.orgId, submissionId: id, type: "sorted", at: now, detail: v.scored ? "not spam" : "not spam (unscored: content check skipped)" });
  await emitSubmissionEvent(db, form, { ...sorted, status: "sorted" }, "submission.received", deps);
  return meterAndRoute(db, form, { ...sorted, status: "sorted" }, deps);
}

/** "Not spam": release from quarantine, remember the sender, train Bayes as ham, then deliver. */
export async function releaseSubmission(db: Db, id: string, orgId: string, by: string, deps: Deps = {}): Promise<Submission | null> {
  const sub = await subs(db).get(id);
  if (!sub || sub.orgId !== orgId || sub.status !== "quarantined") return null;
  const form = await db.docs<Form>("forms").get(sub.formId);
  if (!form) return null;
  const now = deps.now?.() ?? new Date();
  const hp = sub.signals.some((s) => s.name === "honeypot");
  if (sub.emailLower && !hp) await db.docs<{ _id: string; formId: string; orgId: string; email: string; at: Date }>("sender_allow").insert({ _id: `${form._id}|${sub.emailLower}`, formId: form._id, orgId, email: sub.emailLower, at: now });
  await train(db, orgId, form._id, sub.searchText, "ham");
  await subs(db).update({ _id: id }, { status: "sorted", markedSpam: false, releasedAt: now, releasedBy: by });
  await recordEvent(db, { orgId, submissionId: id, type: "released", at: now, detail: "marked not spam by the owner" });
  return meterAndRoute(db, form, { ...sub, status: "sorted", releasedAt: now }, deps);
}

/** "Mark spam": quarantine, train Bayes as spam, and give back the quota unit if it was counted. */
export async function markSpam(db: Db, id: string, orgId: string, now = new Date()): Promise<Submission | null> {
  const sub = await subs(db).get(id);
  if (!sub || sub.orgId !== orgId || sub.status === "quarantined") return null;
  await train(db, orgId, sub.formId, sub.searchText, "spam");
  if (sub.metered) await db.incUsage(orgId, "submissions", periodOf(sub.receivedAt), -1);
  await countSpam(db, orgId, now);
  await subs(db).update({ _id: id }, { status: "quarantined", markedSpam: true, metered: false, holdReason: undefined });
  await recordEvent(db, { orgId, submissionId: id, type: "sorted", at: now, detail: "marked spam by the owner" });
  return subs(db).get(id);
}

export type RedeliverResult = "ok" | "not_found" | "held_over_limit" | "no_recipient" | "is_spam";

/** Sends the notification again as new deliveries with their own timeline. Suppressed recipients stay blocked. */
export async function redeliver(db: Db, id: string, orgId: string, deps: Deps = {}): Promise<RedeliverResult> {
  const sub = await subs(db).get(id);
  if (!sub || sub.orgId !== orgId) return "not_found";
  if (sub.status === "quarantined") return "is_spam";
  if (sub.status === "held" && sub.holdReason === "over_limit") return "held_over_limit";
  const form = await db.docs<Form>("forms").get(sub.formId);
  if (!form) return "not_found";
  return (await dispatchSubmission(db, form, sub, deps)) ? "ok" : "no_recipient";
}

/** Releases over-limit submissions oldest first while the plan has room (month reset or upgrade). */
export async function releaseHeld(db: Db, orgId: string, deps: Deps = {}, limit = 500): Promise<number> {
  const held = await subs(db).find({ orgId, status: "held", holdReason: "over_limit" }, { sort: { receivedAt: 1 }, limit });
  let n = 0;
  for (const sub of held) {
    const form = await db.docs<Form>("forms").get(sub.formId);
    if (!form) continue;
    const before = await subs(db).get(sub._id);
    const after = await meterAndRoute(db, form, { ...before!, holdReason: undefined }, deps);
    if (after.holdReason === "over_limit") break;
    n++;
  }
  return n;
}

/** Hard-bounce recovery: remove the suppression (max 3 per day per org) and clear the banner. */
export async function unsuppressRecipient(db: Db, orgId: string, recipientId: string): Promise<"ok" | "not_found" | "limit"> {
  const r = await db.docs<Recipient>("recipients").get(recipientId);
  if (!r || r.orgId !== orgId) return "not_found";
  if ((await db.hitRateLimit(`unsuppress:${orgId}`, 864e5)) > 3) return "limit";
  await db.removeSuppression(r.email, suppressionScope(orgId));
  await db.docs<Recipient>("recipients").update({ _id: r._id }, { bouncedAt: undefined, bounceDetail: undefined });
  return "ok";
}

const STUCK_MS = 2 * 60_000;
const EXPIRE_DEFERRED_MS = 3 * 864e5;

/** Cron `deliver-pending`: re-drive stuck submissions, retry queued deliveries, expire old deferrals, release held. */
export async function deliverPending(db: Db, deps: Deps = {}) {
  const now = deps.now?.() ?? new Date();
  const stuck = await subs(db).find({ status: "received", receivedAt: { $lt: new Date(now.getTime() - STUCK_MS) } }, { limit: 100, sort: { receivedAt: 1 } });
  for (const s of stuck) await processSubmission(db, s._id, deps);
  const retried = await retryQueued(db, deps);
  const old = await db.docs<Delivery>("deliveries").find({ status: "deferred", lastEventAt: { $lt: new Date(now.getTime() - EXPIRE_DEFERRED_MS) } }, { limit: 100 });
  for (const d of old) {
    await db.docs<Delivery>("deliveries").update({ _id: d._id }, { status: "returned" });
    await recordEvent(db, { orgId: d.orgId, submissionId: d.submissionId, deliveryId: d._id, type: "expired", at: now, detail: "no acceptance after 3 days of retries" });
    await recomputeSubmissionStatus(db, d.submissionId, deps);
  }
  const heldOrgs = [...new Set((await subs(db).find({ status: "held", holdReason: "over_limit" }, { limit: 500, sort: { receivedAt: 1 } })).map((s) => s.orgId))];
  let released = 0;
  for (const o of heldOrgs) released += await releaseHeld(db, o, deps);
  return { reprocessed: stuck.length, retried, expired: old.length, released };
}
