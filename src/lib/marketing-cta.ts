export type Viewer = "in" | "out";

/** The real app entry for a signed-in visitor. */
export const APP_HOME = "/app";

/** Signed in: every "start" call to action becomes a link into the app. Signed out: unchanged. */
export function ctaFor(viewer: Viewer, out: { href: string; label: string }): { href: string; label: string } {
  return viewer === "in" ? { href: APP_HOME, label: "Open app" } : out;
}

/** Pricing button for one plan. Signed in: free plan opens the app, paid plans go straight to billing. */
export function planCtaFor(viewer: Viewer, plan: { id: string; cta: string }, free: boolean, interval: string): { href: string; label: string } {
  if (viewer === "out") return { href: `/sign-in?plan=${plan.id}&interval=${interval}`, label: plan.cta };
  if (free) return { href: APP_HOME, label: "Open app" };
  return { href: `/app/billing?plan=${plan.id}&interval=${interval}`, label: plan.cta };
}
