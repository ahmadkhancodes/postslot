import type { ReactNode } from "react";
import { Section } from "@/components/ui/layout";

export type FeatureSpan = 2 | 3 | 4 | 6;
export interface Feature {
  title: string;
  body: ReactNode;
  /** Kept for callers; the spec sheet lays rows out in one ruled list. */
  span?: FeatureSpan;
  visual?: ReactNode;
}

/**
 * Spec sheet, not a card grid: a ruled list of numbered entries, each with its product fragment beside it.
 * Title column on the left at desktop (4 of 12), entries on the right (8 of 12).
 */
export function Features({ title, intro, items }: { title: ReactNode; intro?: ReactNode; items: Feature[] }) {
  return (
    <Section tone="raised" space="md" labelledBy="features-title">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col gap-4 lg:col-span-4">
          <h2 id="features-title" className="heading-4 text-text md:heading-3">{title}</h2>
          {intro ? <p className="body-3 text-text-subtle">{intro}</p> : null}
        </div>
        <ol className="flex flex-col border-t border-text lg:col-span-8">
          {items.map((f, i) => (
            <li key={f.title} className="grid min-w-0 gap-4 border-b border-border py-6 md:grid-cols-12 md:gap-6">
              <span aria-hidden className="label-mono pt-1 text-accent md:col-span-1">{String(i + 1).padStart(2, "0")}</span>
              <div className={f.visual ? "flex flex-col gap-2 md:col-span-5" : "flex flex-col gap-2 md:col-span-11"}>
                <h3 className="heading-6 text-text">{f.title}</h3>
                <p className="body-6 text-text-subtle">{f.body}</p>
              </div>
              {f.visual ? <div className="min-w-0 rounded border border-border bg-surface md:col-span-6">{f.visual}</div> : null}
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
