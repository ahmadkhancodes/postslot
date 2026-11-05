import type { DeliveryEvent, DeliveryEventType } from "@/lib/forms/types";

export interface TimelineStep {
  id: string;
  type: DeliveryEventType;
  label: string;
  at: Date;
  detail?: string;
  tone: "done" | "pending" | "warn" | "bad";
}

const LABEL: Record<DeliveryEventType, string> = {
  received: "Received", sorted: "Sorted", dispatched: "Dispatched", deferred: "Deferred", accepted: "Accepted",
  returned: "Returned", complaint: "Complaint", blocked: "Blocked", expired: "Expired", released: "Released",
};
const TONE: Record<DeliveryEventType, TimelineStep["tone"]> = {
  received: "done", sorted: "done", dispatched: "done", deferred: "warn", accepted: "done",
  returned: "bad", complaint: "bad", blocked: "bad", expired: "bad", released: "done",
};
const ORDER: DeliveryEventType[] = ["received", "sorted", "released", "dispatched", "deferred", "accepted", "returned", "complaint", "blocked", "expired"];

/** Receipt stamps in order: Received, Sorted, Dispatched, then Deferred/Accepted/Returned. Same instant keeps stamp order. */
export function timelineSteps(events: Pick<DeliveryEvent, "_id" | "type" | "at" | "detail">[]): TimelineStep[] {
  return [...events]
    .sort((a, b) => a.at.getTime() - b.at.getTime() || ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    .map((e) => ({ id: e._id, type: e.type, label: LABEL[e.type], at: e.at, detail: e.detail, tone: TONE[e.type] }));
}

/** True while the receipt can still change (a delivery is open), so the inbox polls. */
export function timelineOpen(steps: Pick<TimelineStep, "type">[]): boolean {
  const last = [...steps].reverse().find((s) => ["dispatched", "deferred", "accepted", "returned", "complaint", "blocked", "expired"].includes(s.type));
  return !!last && (last.type === "dispatched" || last.type === "deferred");
}
