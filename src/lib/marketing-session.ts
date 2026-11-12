"use client";
import { authClient } from "@/lib/auth/client";
import { useSyncExternalStore } from "react";
import { ctaFor, type Viewer } from "@/lib/marketing-cta";

const noop = () => () => {};

/**
 * Session state for the static marketing pages. The server HTML is always the signed-out one (pages stay cacheable);
 * after hydration the client reads the session and only swaps labels and hrefs. Until the session answers, "out" is shown
 * (at most one short flash for signed-in visitors, no layout shift because only text changes).
 */
export function useViewer(): Viewer {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const { data } = authClient.useSession();
  return hydrated && data?.user ? "in" : "out";
}

/** A CTA that reads "Create a form" signed out and "Open Postslot" signed in. */
export function useCta(out: { href: string; label: string }) {
  return ctaFor(useViewer(), out);
}
