import { cn } from "@/components/ui/cn";
import { Postmark } from "./postmark";
import { StatusChip, Timeline, type SubmissionStatus } from "./receipt";

const rows: { who: string; ts: string; msg: string; status: SubmissionStatus }[] = [
  { who: "Anna Kowalski", ts: "14:02", msg: "Hi, can I book a cleaning for next Tuesday?", status: "Delivered" },
  { who: "Marcus Bell", ts: "13:41", msg: "Do you take new patients on Saturdays?", status: "Delivered" },
  { who: "cheap-seo-offer", ts: "13:12", msg: "7 links, honeypot field filled", status: "Spam blocked" },
  { who: "Priya Nair", ts: "12:58", msg: "Quote request for an office fit out", status: "Held over limit" },
  { who: "Tom Whitlock", ts: "11:20", msg: "Please call me back about my invoice", status: "Returned" },
];

/**
 * The real inbox ledger with one submission's receipt laid on top, as in the app. Example data, labelled.
 * At 375 the ledger shows three rows and the receipt sits below it.
 */
export function InboxPreview() {
  return (
    <figure className="m-0 min-w-0">
      <div className="relative">
        <div className="overflow-hidden rounded border border-border bg-surface shadow-stamp">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <p className="title-4 shrink-0 text-text">Inbox</p>
            <p className="caption-5 min-w-0 flex-1 truncate text-text-subtle">Contact form · northfield-dental.example</p>
            <p className="hidden shrink-0 code-2 text-text-muted sm:block">f/k3Qx9…aT7w</p>
          </div>
          <div className="hidden grid-cols-[9rem_1fr_8rem_3rem] gap-4 border-b border-border bg-surface-raised px-4 py-2 md:grid">
            <span className="label-mono text-text-muted">From</span>
            <span className="label-mono text-text-muted">Message</span>
            <span className="label-mono text-text-muted">Status</span>
            <span className="label-mono text-right text-text-muted">UTC</span>
          </div>
          <ul className="flex flex-col">
            {rows.map((r, i) => (
              <li
                key={r.who}
                className={cn(
                  "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[9rem_1fr_8rem_3rem]",
                  i === 0 && "bg-accent-surface",
                  i > 2 && "hidden md:grid",
                )}
              >
                <span className="title-4 truncate text-text">{r.who}</span>
                <span className="order-3 col-span-2 caption-2 truncate text-text-subtle md:order-none md:col-span-1">{r.msg}</span>
                <span className="order-2 md:order-none"><StatusChip status={r.status} /></span>
                <span className="hidden text-right code-2 tabular-nums text-text-muted md:block">{r.ts}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative z-10 mt-4 flex flex-col gap-4 rounded border border-border-receipt bg-surface-receipt p-4 shadow-stamp sm:p-6 lg:-mt-24 lg:ml-auto lg:max-w-md">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="label-mono text-text-subtle">Delivery receipt</p>
              <p className="title-3 mt-1 text-text">Anna Kowalski</p>
              <p className="mt-1 truncate code-2 text-text-subtle">to reception@northfield-dental.example</p>
            </div>
            <Postmark time="14:02:07" date="05 NOV 2026" className="-mr-2 -mt-2 size-24 shrink-0" />
          </div>
          <div aria-hidden className="tear-line" />
          <Timeline
            steps={[
              { name: "Received", time: "14:02:03", detail: "Posted from northfield-dental.example" },
              { name: "Sorted", time: "14:02:04", detail: "Spam score 0.04, no signals" },
              { name: "Dispatched", time: "14:02:04" },
              { name: "Accepted", time: "14:02:07", detail: "250 OK from the recipient's mail server" },
            ]}
          />
        </div>
      </div>
      <figcaption className="caption-5 mt-3 text-text-muted">Example data. Names and addresses are fictional.</figcaption>
    </figure>
  );
}
