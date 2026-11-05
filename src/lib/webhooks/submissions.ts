import { limitFor } from "@/lib/billing/entitlement";
import type { Db } from "@/lib/db/types";
import type { Form, Submission } from "@/lib/forms/types";
import { log } from "@/lib/logger";
import { emitEvent } from "./outbound";

/** Per-form outbound webhook events (docs/brief.md MVP item 8: Starter and above). */
export const SUBMISSION_EVENTS = ["submission.received", "submission.delivered", "submission.bounced", "submission.held"] as const;
export type SubmissionEvent = (typeof SUBMISSION_EVENTS)[number];
export const isSubmissionEvent = (e: string): e is SubmissionEvent => (SUBMISSION_EVENTS as readonly string[]).includes(e);

/** Plan gate: webhooks need a plan with an integration slot (Starter and above; Free has none). */
export async function webhooksAllowed(db: Db, orgId: string, now = Date.now()): Promise<boolean> {
  return limitFor(await db.getEntitlement(orgId), "integrations", now) > 0;
}

export function eventPayload(event: SubmissionEvent, form: Pick<Form, "_id" | "name">, sub: Submission) {
  return {
    form: { id: form._id, name: form.name },
    submission: {
      id: sub._id, status: sub.status, receivedAt: sub.receivedAt.toISOString(), isTest: sub.isTest,
      ...(event === "submission.received" ? { fields: sub.fields, replyTo: sub.replyTo ?? null, origin: sub.origin ?? null } : {}),
      ...(event === "submission.held" ? { holdReason: sub.holdReason ?? null } : {}),
    },
  };
}

export interface EmitDeps { fetchFn?: typeof fetch; now?: () => Date }

/** Fire-and-log: a failing webhook never breaks ingest or delivery. Returns how many endpoints were called. */
export async function emitSubmissionEvent(db: Db, form: Pick<Form, "_id" | "orgId" | "name">, sub: Submission, event: SubmissionEvent, deps: EmitDeps = {}): Promise<number> {
  try {
    const now = deps.now?.() ?? new Date();
    if (!(await webhooksAllowed(db, form.orgId, now.getTime()))) return 0;
    const out = await emitEvent(form.orgId, event, eventPayload(event, form, sub), { db, fetchFn: deps.fetchFn, now, formId: form._id });
    return out.length;
  } catch (e) {
    log.warn("submission_event_failed", { event, message: (e as Error).message });
    return 0;
  }
}

/** Endpoints that belong to one form (never the org-wide ones). The secret is not included. */
export async function listFormWebhooks(db: Db, orgId: string, formId: string) {
  return (await db.listWebhookEndpoints(orgId)).filter((e) => e.formId === formId).map(({ secret: _s, ...e }) => e);
}
