import Stripe from "stripe";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";

let cached: { key: string; client: Stripe } | null = null;

/** Stripe client, or null in stub mode (no STRIPE_SECRET_KEY yet). */
export function getStripe(): Stripe | null {
  const e = env();
  const key = e.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (cached?.key === key) return cached.client;
  cached = { key, client: new Stripe(key, { appInfo: { name: "buffersol-kit" }, maxNetworkRetries: 2, timeout: 15_000, ...stripeHost(key, e.STRIPE_API_BASE) }) };
  return cached.client;
}

/** API host override for the end-to-end billing tests' local Stripe stand-in. Never applies to a live key. */
export function stripeHost(key: string, base: string | undefined): { host?: string; port?: number; protocol?: "http" | "https" } {
  if (!base || !key.startsWith("sk_test_")) return {};
  const u = new URL(base);
  return { host: u.hostname, port: Number(u.port || (u.protocol === "http:" ? 80 : 443)), protocol: u.protocol === "http:" ? "http" : "https" };
}

export function requireStripe(): Stripe {
  const s = getStripe();
  if (!s) throw new HttpError(503, "billing_unavailable");
  return s;
}
