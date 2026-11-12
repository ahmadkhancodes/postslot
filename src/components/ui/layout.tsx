import type { ReactNode } from "react";
import { cn } from "./cn";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/** Marketing section: 48-64px mobile, 64-96px desktop vertical padding by `space`. Pass `tone` to step the surface. */
export function Section({ id, tone = "base", space = "lg", className, children, labelledBy }: { id?: string; tone?: "base" | "raised" | "receipt" | "inverse"; space?: "lg" | "md" | "sm"; className?: string; children: ReactNode; labelledBy?: string }) {
  const t = { base: "bg-surface", raised: "bg-surface-raised", receipt: "bg-surface-receipt", inverse: "bg-surface-inverse text-text-inverse" }[tone];
  // Varied rhythm (design brief §4): sections do not all share one padding.
  const s = { lg: "py-16 md:py-24", md: "py-12 md:py-20", sm: "py-12 md:py-16" }[space];
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(s, t, className)}>
      <Container>{children}</Container>
    </section>
  );
}
