"use client";
import { useSyncExternalStore } from "react";
import { ctaFor, type Viewer } from "@/lib/marketing-cta";

/**
 * Session state for the static marketing pages. The server HTML is always the signed-out one (pages stay cacheable);
 * after hydration the client reads the session once and only swaps labels and hrefs. Until the session answers, "out" is
 * shown (at most one short flash for signed-in visitors, no layout shift because only text changes).
 *
 * This is a plain `fetch` of the Better Auth `get-session` endpoint instead of the full auth client: the client library
 * (about 60 KB) cost the landing page its Lighthouse budget. Sign out still goes through the real client, loaded on click.
 */
let viewer: Viewer = "out";
const listeners = new Set<() => void>();

function emit(next: Viewer) {
  if (next === viewer) return;
  viewer = next;
  for (const l of listeners) l();
}

/** Reads the session each time marketing UI mounts from nothing (first load, or back from the app). */
function start() {
  if (typeof window === "undefined") return;
  const run = () => {
    fetch("/api/auth/get-session", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: unknown } | null) => emit(data?.user ? "in" : "out"))
      .catch(() => emit("out"));
  };
  // Off the critical path: the CTA swap can wait for the browser to be idle.
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 1);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => listeners.delete(listener);
}

export function useViewer(): Viewer {
  return useSyncExternalStore(subscribe, () => viewer, () => "out");
}

/** Signs out with the real auth client (loaded only now), then reloads at `to`. */
export async function signOutAndGo(to: string) {
  const { authClient } = await import("@/lib/auth/client");
  await authClient.signOut();
  emit("out");
  window.location.assign(to);
}

/** A CTA that reads "Create a form" signed out and "Open Postslot" signed in. */
export function useCta(out: { href: string; label: string }) {
  return ctaFor(useViewer(), out);
}
