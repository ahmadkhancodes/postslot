import { CheckCircle, Clock, ProhibitInset, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";

export type SubmissionStatus = "Delivered" | "Spam blocked" | "Held over limit" | "Returned" | "In transit" | "Held, address unconfirmed";

const chip: Record<SubmissionStatus, { cls: string; Icon: typeof CheckCircle }> = {
  Delivered: { cls: "border-action text-action bg-action-surface", Icon: CheckCircle },
  "Spam blocked": { cls: "border-border-strong text-text-subtle bg-surface", Icon: ProhibitInset },
  "Held over limit": { cls: "border-warning text-warning bg-warning-surface", Icon: Clock },
  Returned: { cls: "border-danger text-danger bg-danger-surface", Icon: WarningOctagon },
  "In transit": { cls: "border-border-strong text-text-subtle bg-surface", Icon: Clock },
  "Held, address unconfirmed": { cls: "border-warning text-warning bg-warning-surface", Icon: Clock },
};

/** Status is always an icon plus words, never colour alone. */
export function StatusChip({ status }: { status: SubmissionStatus }) {
  const { cls, Icon } = chip[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-2 py-0.5 caption-4", cls)}>
      <Icon size={16} weight="regular" aria-hidden />
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

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const deferred = s.state === "deferred";
        const Icon = deferred ? Clock : CheckCircle;
        return (
          <li key={`${s.name}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 ? <span aria-hidden className="absolute bottom-0 left-2 top-5 w-px bg-border" /> : null}
            <Icon size={16} weight="regular" aria-hidden className={cn("relative mt-0.5 shrink-0 bg-surface", deferred ? "text-warning" : "text-action")} />
            <div className="flex min-w-0 flex-col">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="title-4 text-text">{s.name}</span>
                <span className="font-mono text-xs text-text-muted">{s.time}</span>
              </p>
              {s.detail ? <p className="caption-5 text-text-subtle">{s.detail}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
