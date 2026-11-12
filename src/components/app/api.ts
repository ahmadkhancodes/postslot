"use client";
import { useCallback, useEffect, useState } from "react";

const MESSAGES: Record<string, string> = {
  unauthorized: "Your session has ended. Sign in again to continue.",
  forbidden: "Your role does not allow this action. Ask an owner or admin.",
  already_subscribed: "This organization already has an active subscription. Use Manage billing to change it.",
  billing_unavailable: "Billing is not connected yet.",
  no_customer: "There is no billing profile for this organization yet. Choose a plan first.",
  plan_required: "This needs a higher plan.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  invalid_url: "Enter a full URL starting with https://.",
  invalid_body: "Some fields are missing or invalid.",
  not_found: "That item no longer exists.",
};

export function humanError(code: string | undefined, fallback = "Something went wrong. Try again in a moment."): string {
  if (!code) return fallback;
  return MESSAGES[code] ?? fallback;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };

const inflight = new Map<string, Promise<ApiResult<never>>>();

/**
 * Same-origin JSON call. Never throws; errors come back as { ok:false, code, message }.
 * A write identical to one still in flight (a double click before the button re-renders as busy) shares that request
 * instead of creating a second row.
 */
export function api<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  if (method === "GET") return send<T>(path, init);
  const key = `${method} ${path} ${JSON.stringify(init.body ?? null)}`;
  const running = inflight.get(key);
  if (running) return running as Promise<ApiResult<T>>;
  const p = send<T>(path, init).finally(() => inflight.delete(key));
  inflight.set(key, p as Promise<ApiResult<never>>);
  return p;
}

async function send<T>(path: string, init: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    });
    const text = await res.text();
    let parsed: unknown = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
    if (!res.ok) {
      const code = (parsed as { error?: string }).error ?? "error";
      return { ok: false, status: res.status, code, message: humanError(code) };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, status: 0, code: "network", message: "Could not reach the server. Check your connection and try again." };
  }
}

/** Better Auth client calls resolve to { data, error }. Turn the error into a plain sentence. */
export function authError(error: { message?: string; code?: string; status?: number } | null | undefined, fallback = "Something went wrong. Try again in a moment."): string | null {
  if (!error) return null;
  if (error.status === 429) return humanError("rate_limited");
  return error.message && error.message.length < 140 ? error.message : fallback;
}

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Load on mount and on reload(). State is only set from promise callbacks. */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    load()
      .then((data) => { if (alive) setState({ data, error: null, loading: false }); })
      .catch((e: unknown) => { if (alive) setState((s) => ({ data: s.data, error: e instanceof Error && e.message ? e.message : "Could not load this.", loading: false })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Full-page navigation (new session or org means server layouts must re-render from scratch). */
export function hardNavigate(path: string) {
  window.location.assign(path);
}
