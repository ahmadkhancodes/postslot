import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";

export interface HeroProps {
  title: ReactNode;
  subtitle: ReactNode;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  /** Short ruled facts under the actions: true product facts only, never invented numbers. */
  facts?: { term: string; detail: string }[];
  proof?: ReactNode;
  /** The REAL product UI. */
  visual: ReactNode;
}

/** Split hero, 5/7: the claim and one action on the left, the product on the right. Left aligned, solid ink, no glow. */
export function Hero({ title, subtitle, primaryCta, secondaryCta, facts, proof, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="border-b border-border bg-surface pb-12 pt-10 md:pb-20 md:pt-16">
      <Container>
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-6">
          <div className="flex flex-col items-start gap-6 lg:col-span-5 lg:pt-8">
            <h1 id="hero-title" className="heading-3 text-text md:heading-2">{title}</h1>
            <p className="body-3 max-w-xl text-text-subtle md:title-2 md:font-normal">{subtitle}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <ButtonLink href={primaryCta.href} size="lg">{primaryCta.label}</ButtonLink>
              {secondaryCta ? (
                <Link href={secondaryCta.href} className="inline-flex min-h-11 items-center rounded-sm button-md text-text underline decoration-border-strong underline-offset-4 transition-colors duration-300 ease-out-kit hover:text-accent hover:decoration-accent focus-visible:focus-ring">
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
          </div>
          <div className="min-w-0 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">{visual}</div>
          <div className="flex flex-col items-start gap-6 lg:col-span-5">
            {facts?.length ? (
              <dl className="grid w-full max-w-xl grid-cols-2 border-t border-border">
                {facts.map((f) => (
                  <div key={f.term} className="flex flex-col gap-1 border-b border-border py-3 odd:pr-4">
                    <dt className="font-mono text-xs text-text sm:text-sm">{f.term}</dt>
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
