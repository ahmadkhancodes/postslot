import type { MonthUsage } from "@/lib/usage/report";
import { niceMax } from "@/lib/usage/report";

const W = 720, H = 280, L = 48, R = 12, T = 16, B = 32;
const monthLabel = (p: string) => new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${p}-01T00:00:00Z`));
const num = (n: number) => new Intl.NumberFormat("en").format(n);

/** 12 month bars (counted + held) with the plan limit as a dashed line. Plain SVG, no chart library; a table below it carries the same numbers. */
export function UsageChart({ months, limit }: { months: MonthUsage[]; limit: number }) {
  const max = niceMax(Math.max(limit, ...months.map((m) => m.submissions + m.held)));
  const plotW = W - L - R, plotH = H - T - B;
  const slot = plotW / months.length, bar = Math.min(32, slot * 0.6);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const summary = `Submissions per month for the last 12 months against a plan limit of ${num(limit)}. ${months.map((m) => `${monthLabel(m.period)} ${num(m.submissions)} counted, ${num(m.held)} held`).join("; ")}.`;
  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="fill-text-subtle" fontSize={11}>{num(t)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = L + slot * i + (slot - bar) / 2;
          const hCounted = (m.submissions / max) * plotH, hHeld = (m.held / max) * plotH;
          return (
            <g key={m.period}>
              <title>{`${monthLabel(m.period)} ${m.period.slice(0, 4)}: ${num(m.submissions)} counted, ${num(m.held)} held`}</title>
              {hCounted > 0 ? <rect x={x} y={y(m.submissions)} width={bar} height={hCounted} rx={2} className="fill-action" /> : null}
              {hHeld > 0 ? <rect x={x} y={y(m.submissions) - hHeld} width={bar} height={hHeld} rx={2} className="fill-warning" /> : null}
              <text x={x + bar / 2} y={H - 10} textAnchor="middle" className="fill-text-subtle" fontSize={11}>{monthLabel(m.period)}</text>
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(limit)} y2={y(limit)} className="stroke-text" strokeWidth={1.5} strokeDasharray="5 4" />
        <text x={W - R} y={y(limit) - 6} textAnchor="end" className="fill-text" fontSize={11}>Plan limit {num(limit)}</text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-6 gap-y-2 caption-2 text-text-subtle">
        <span className="inline-flex items-center gap-2"><span aria-hidden className="size-3 rounded-sm bg-action" />Counted</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="size-3 rounded-sm bg-warning" />Held over the limit</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-text" />Plan limit</span>
      </figcaption>
    </figure>
  );
}
