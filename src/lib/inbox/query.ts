import type { Db, DocFilter } from "@/lib/db/types";
import { timelineSteps, type TimelineStep } from "@/lib/delivery/timeline";
import type { Delivery, DeliveryEvent, Form, Submission } from "@/lib/forms/types";

export const INBOX_FILTERS = ["all", "delivered", "spam", "held", "returned"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const FILTER_LABEL: Record<InboxFilter, string> = { all: "All", delivered: "Delivered", spam: "Spam", held: "Held", returned: "Returned" };

export const parseFilter = (v: string | null | undefined): InboxFilter => (INBOX_FILTERS as readonly string[]).includes(v ?? "") ? (v as InboxFilter) : "all";

/** "All" is everything that is not spam. Spam lives in its own tab so the inbox stays the real mail. */
export function statusFilter(f: InboxFilter): DocFilter {
  switch (f) {
    case "delivered": return { status: "delivered" };
    case "spam": return { status: "quarantined" };
    case "held": return { status: "held" };
    case "returned": return { status: { $in: ["returned", "failed"] } };
    default: return { status: { $ne: "quarantined" } };
  }
}

export interface ListOpts { formId?: string; filter?: InboxFilter; q?: string; before?: Date; limit?: number }

export function inboxQuery(orgId: string, o: ListOpts): DocFilter {
  const q = o.q?.trim().slice(0, 100);
  return {
    orgId,
    ...statusFilter(o.filter ?? "all"),
    ...(o.formId ? { formId: o.formId } : {}),
    ...(q ? { searchText: { $text: q } } : {}),
    ...(o.before ? { receivedAt: { $lt: o.before } } : {}),
  };
}

export async function listSubmissions(db: Db, orgId: string, o: ListOpts = {}): Promise<Submission[]> {
  return db.docs<Submission>("submissions").find(inboxQuery(orgId, o), { sort: { receivedAt: -1 }, limit: Math.min(o.limit ?? 50, 50_000) });
}

export async function filterCounts(db: Db, orgId: string, formId?: string): Promise<Record<InboxFilter, number>> {
  const entries = await Promise.all(INBOX_FILTERS.map(async (f) => [f, await db.docs<Submission>("submissions").count(inboxQuery(orgId, { filter: f, formId }))] as const));
  return Object.fromEntries(entries) as Record<InboxFilter, number>;
}

export interface Detail { submission: Submission; form: Form | null; deliveries: Delivery[]; steps: TimelineStep[] }

export async function getDetail(db: Db, orgId: string, id: string): Promise<Detail | null> {
  const submission = await db.docs<Submission>("submissions").get(id);
  if (!submission || submission.orgId !== orgId) return null;
  const [form, deliveries, events] = await Promise.all([
    db.docs<Form>("forms").get(submission.formId),
    db.docs<Delivery>("deliveries").find({ submissionId: id }, { sort: { createdAt: 1 } }),
    db.docs<DeliveryEvent>("delivery_events").find({ submissionId: id }, { limit: 200 }),
  ]);
  return { submission, form, deliveries, steps: timelineSteps(events) };
}
