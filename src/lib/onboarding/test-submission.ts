import type { Deps } from "@/lib/delivery/dispatch";
import { recordEvent } from "@/lib/delivery/events";
import { processSubmission } from "@/lib/delivery/process";
import { timelineSteps, type TimelineStep } from "@/lib/delivery/timeline";
import type { Db } from "@/lib/db/types";
import { uuidv7 } from "@/lib/ids";
import { buildSearchText } from "@/lib/forms/ingest";
import type { Delivery, DeliveryEvent, Form, Submission } from "@/lib/forms/types";

export interface TestReceipt { id: string; status: Submission["status"]; steps: TimelineStep[]; deliveries: { email: string; status: Delivery["status"] }[] }

/**
 * "Send test submission": a labelled submission (`isTest`) that goes through scoring and delivery like a real one but is never metered
 * (the meter skips `isTest`) and shows "[Test]" in the email. Returns the receipt as it stands once processing has run.
 */
export async function sendTestSubmission(db: Db, form: Form, by: { email: string }, deps: Deps = {}): Promise<TestReceipt> {
  const now = deps.now?.() ?? new Date();
  const fields = { name: "Postslot test", email: by.email, message: "This is a test submission sent from your dashboard. If you can read it, your recipients and delivery are working." };
  const sub: Submission = {
    _id: uuidv7(now.getTime()), orgId: form.orgId, formId: form._id, receivedAt: now, status: "received", fields, replyTo: by.email,
    searchText: buildSearchText({ fields, replyTo: by.email, honeypotFilled: false }), emailLower: by.email, spamScore: 0, signals: [], scored: false,
    isTest: true, ipHash: "dashboard", ua: "postslot-dashboard", purgeAt: new Date(now.getTime() + 7 * 864e5),
  };
  await db.docs<Submission>("submissions").insert(sub);
  await recordEvent(db, { orgId: sub.orgId, submissionId: sub._id, type: "received", at: now, detail: "test submission from the dashboard" });
  const done = (await processSubmission(db, sub._id, deps)) ?? sub;
  const [events, deliveries] = await Promise.all([
    db.docs<DeliveryEvent>("delivery_events").find({ submissionId: sub._id }, { limit: 200 }),
    db.docs<Delivery>("deliveries").find({ submissionId: sub._id }),
  ]);
  return { id: sub._id, status: (await db.docs<Submission>("submissions").get(sub._id))?.status ?? done.status, steps: timelineSteps(events), deliveries: deliveries.map((d) => ({ email: d.recipientEmail, status: d.status })) };
}
