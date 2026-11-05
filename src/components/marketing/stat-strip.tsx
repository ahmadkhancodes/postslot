import { Container } from "@/components/ui/layout";

export interface Stat { value: string; label: string }

/** Facts, not logos: every figure comes from the plans in product.ts. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <section aria-label="Facts" className="bg-surface pb-12 md:pb-24">
      <Container>
        <dl className="grid grid-cols-2 rounded-lg border border-border lg:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.value} className={`flex flex-col gap-1 p-4 md:p-6 ${i % 2 === 0 ? "border-r border-border" : ""} ${i < 2 ? "border-b border-border lg:border-b-0" : ""} ${i === 1 ? "lg:border-r" : ""}`}>
              <dt className="heading-5 tabular-nums text-text">{s.value}</dt>
              <dd className="caption-2 text-text-subtle">{s.label}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
