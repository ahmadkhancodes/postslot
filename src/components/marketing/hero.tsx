import { SessionCta } from "./session-cta";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/layout";

export interface HeroProps {
  title: ReactNode;
  subtitle: ReactNode;
  /** The one action above the fold (no competing secondary CTA, skill A4). */
  primaryCta: { href: string; label: string };
  /** Short ruled facts under the actions: true product facts only, never invented numbers. */
  facts?: { term: string; detail: string }[];
  proof?: ReactNode;
  /** The REAL product UI. */
  visual: ReactNode;
}

/**
 * Split hero, 5/7: the claim and one action on the left, the product on the right. Left aligned, flat ink heading
 * (the stone and rust palette reads better without the grey text gradient), heading and subheading capped at 680px.
 */
export function Hero({ title, subtitle, primaryCta, facts, proof, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="border-b border-border bg-surface pb-12 pt-10 md:pb-20 md:pt-16">
      <Container>
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-6">
          <div className="flex flex-col items-start gap-6 lg:col-span-5 lg:pt-8">
            <h1 id="hero-title" className="heading-3 max-w-[680px] text-text md:heading-2">{title}</h1>
            <p className="body-3 max-w-[680px] text-text-subtle md:body-7">{subtitle}</p>
            <SessionCta href={primaryCta.href} label={primaryCta.label} size="md" />
          </div>
          <div className="min-w-0 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">{visual}</div>
          <div className="flex flex-col items-start gap-6 lg:col-span-5">
            {facts?.length ? (
              <dl className="grid w-full max-w-xl grid-cols-2 border-t border-border">
                {facts.map((f) => (
                  <div key={f.term} className="flex flex-col gap-1 border-b border-border py-3 odd:pr-4">
                    <dt className="code-2 text-text sm:code-1">{f.term}</dt>
                    <dd className="caption-5 text-text-subtle">{f.detail}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {proof ? <div className="caption-2 max-w-xl text-text-subtle">{proof}</div> : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
