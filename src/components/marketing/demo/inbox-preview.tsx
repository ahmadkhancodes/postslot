import { Tray } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";
import { Postmark } from "./postmark";
import { StatusChip, Timeline, type SubmissionStatus } from "./receipt";

const rows: { who: string; ts: string; msg: string; status: SubmissionStatus }[] = [
  { who: "Anna Kowalski", ts: "14:02:03", msg: "Hi, can I book a cleaning for next Tuesday?", status: "Delivered" },
  { who: "Marcus Bell", ts: "13:41:55", msg: "Do you take new patients on Saturdays?", status: "Delivered" },
  { who: "cheap-seo-offer", ts: "13:12:09", msg: "7 links, honeypot field filled", status: "Spam blocked" },
  { who: "Priya Nair", ts: "12:58:30", msg: "Quote request for office fit out", status: "Held over limit" },
  { who: "Tom Whitlock", ts: "11:20:44", msg: "Please call me back about my invoice", status: "Returned" },
];

/** The real inbox with one submission's receipt. Illustration, labelled as such. At 375 only the selected row and its receipt show. */
export function InboxPreview() {
  return (
    <figure className="m-0 min-w-0">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border bg-surface-raised px-4 py-3">
          <Tray size={20} weight="regular" aria-hidden className="shrink-0 text-text-subtle" />
          <p className="title-4 shrink-0 text-text">Inbox</p>
          <p className="caption-5 min-w-0 flex-1 truncate text-text-subtle">Contact form, northfield-dental.example</p>
          <p className="hidden shrink-0 font-mono text-xs text-text-muted sm:block">f/k3Qx9…aT7w</p>
        </div>
        <div className="grid md:grid-cols-2">
          <ul className="flex flex-col">
            {rows.map((r, i) => (
              <li
                key={r.who}
                className={cn(
                  "grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3",
                  i === 0 ? "grid bg-action-surface" : "hidden md:grid",
                )}
              >
                <p className="flex min-w-0 items-baseline gap-2">
                  <span className="title-4 truncate text-text">{r.who}</span>
                  <span className="shrink-0 font-mono text-xs text-text-muted">{r.ts}</span>
                </p>
                <StatusChip status={r.status} />
                <p className="caption-5 col-span-2 truncate text-text-subtle">{r.msg}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-4 border-border p-4 md:border-l">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="title-4 text-text">Receipt for message from Anna Kowalski</p>
                <p className="mt-1 truncate font-mono text-xs text-text-muted">sub_01JC8F2Q · to reception@northfield-dental.example</p>
              </div>
              <Postmark time="14:02:07" date="05 NOV 2026" className="size-24 shrink-0" />
            </div>
            <div className="flex flex-col gap-2">
              <p className="caption-3 text-text-subtle">Delivery timeline</p>
              <Timeline
                steps={[
                  { name: "Received", time: "14:02:03", detail: "Posted from northfield-dental.example" },
                  { name: "Sorted", time: "14:02:04", detail: "Spam score 0.04, 0 signals" },
                  { name: "Dispatched", time: "14:02:04", detail: "Handed to the mail sender" },
                  { name: "Accepted", time: "14:02:07", detail: "Accepted by the recipient's mail server" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
      <figcaption className="caption-5 mt-2 text-text-subtle">Illustration. Names and addresses are fictional.</figcaption>
    </figure>
  );
}
