import type { SubmissionStatus as ChipStatus } from "@/components/marketing/demo/receipt";
import type { Submission } from "@/lib/forms/types";

export function chipFor(s: Pick<Submission, "status" | "holdReason">): ChipStatus {
  switch (s.status) {
    case "delivered": return "Delivered";
    case "quarantined": return "Spam blocked";
    case "returned": case "failed": return "Returned";
    case "held": return s.holdReason === "recipient_unverified" ? "Held, address unconfirmed" : "Held over limit";
    default: return "In transit";
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
export const clock = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
export const dayStamp = (d: Date) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d).toUpperCase();
export const shortWhen = (d: Date, now = new Date()) =>
  now.getTime() - d.getTime() < 864e5 ? `${clock(d).slice(0, 5)} UTC` : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);

/** Who sent it, for the list row. */
export const senderOf = (s: Pick<Submission, "fromName" | "replyTo" | "fields">) =>
  s.fromName || s.fields.name || s.replyTo || s.fields.email || "Anonymous";

export const previewOf = (s: Pick<Submission, "fields" | "subject">) => {
  const msg = s.fields.message ?? s.fields.body ?? Object.entries(s.fields).find(([k]) => !["name", "email"].includes(k))?.[1] ?? "";
  return (s.subject ? `${s.subject}: ` : "") + msg.replace(/\s+/g, " ").slice(0, 140);
};
