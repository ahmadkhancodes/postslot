import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Postmark } from "./demo/postmark";

/** Closing band on manila, the receipt colour, with the stamp as the one signature mark. */
export function FinalCta({ title, body, cta, note }: { title: ReactNode; body?: ReactNode; cta: { href: string; label: string }; note?: ReactNode }) {
  return (
    <section aria-labelledby="final-cta-title" className="border-y border-border-receipt bg-surface-receipt py-16 md:py-20">
      <Container>
        <div className="grid items-center gap-8 md:grid-cols-12">
          <div className="flex flex-col items-start gap-6 md:col-span-8">
            <h2 id="final-cta-title" className="heading-4 max-w-3xl text-text md:heading-2">{title}</h2>
            {body ? <p className="body-3 max-w-2xl text-text-subtle">{body}</p> : null}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <ButtonLink href={cta.href} size="lg">{cta.label}</ButtonLink>
              {note ? <div className="caption-2 text-text-subtle">{note}</div> : null}
            </div>
          </div>
          <div aria-hidden className="hidden justify-end md:col-span-4 md:flex">
            <Postmark time="TODAY" date="FREE PLAN" className="h-auto w-3xs max-w-full" />
          </div>
        </div>
      </Container>
    </section>
  );
}
