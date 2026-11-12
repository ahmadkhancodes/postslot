import { cn } from "@/components/ui/cn";

export type SubmissionStatus = "Delivered" | "Spam blocked" | "Held over limit" | "Returned" | "In transit" | "Held, address unconfirmed";

const chip: Record<SubmissionStatus, { text: string; dot: string }> = {
  Delivered: { text: "text-success", dot: "bg-success" },
  "Spam blocked": { text: "text-text-subtle", dot: "bg-text-muted" },
  "Held over limit": { text: "text-warning", dot: "bg-warning" },
  Returned: { text: "text-danger", dot: "bg-danger" },
  "In transit": { text: "text-text-subtle", dot: "bg-border-strong" },
  "Held, address unconfirmed": { text: "text-warning", dot: "bg-warning" },
};

/** Status is a word plus a square mark, never colour alone. Square, 2px, no pill. */
export function StatusChip({ status }: { status: SubmissionStatus }) {
  const { text, dot } = chip[status];
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap caption-4", text)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-xs", dot)} />
      {status}
    </span>
  );
}

export interface TimelineStep {
  name: string;
  time: string;
  detail?: string;
  /** "deferred" = recipient server asked to retry. */
  state?: "done" | "deferred";
}

/** The receipt ledger: time in mono on the left, the event on a ruled line on the right. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const deferred = s.state === "deferred";
        return (
          <li key={`${s.name}-${i}`} className="relative grid grid-cols-[auto_1fr] gap-x-4 pb-3 last:pb-0">
            <span className="pt-0.5 font-mono text-xs tabular-nums text-text-muted">{s.time}</span>
            <div className="relative flex min-w-0 flex-col pl-4">
              <span aria-hidden className={cn("absolute left-0 top-2 size-2 rounded-xs", deferred ? "bg-warning" : "bg-accent")} />
              {i < steps.length - 1 ? <span aria-hidden className="absolute -bottom-1 left-1 top-4 w-px bg-border-receipt" /> : null}
              <span className={cn("title-4", deferred ? "text-warning" : "text-text")}>{s.name}</span>
              {s.detail ? <span className="caption-5 text-text-subtle">{s.detail}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
