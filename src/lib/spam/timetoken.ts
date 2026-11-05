import { hmacSha256Hex, safeEqual } from "@/lib/ids";
import type { SpamSignal } from "@/lib/forms/types";

// Signed time token: `${issuedAtMs}.${hmac(secret, "formKey|issuedAtMs")}` written by ps.js on page load.
export const TOO_FAST_MS = 2_000;
export const STALE_MS = 24 * 3600_000;

export async function issueTimeToken(secret: string, formKey: string, now = Date.now()): Promise<string> {
  return `${now}.${await hmacSha256Hex(secret, `${formKey}|${now}`)}`;
}

/** Missing token adds nothing (forms without JS stay valid). Bad signature, too fast and stale add 0.6 each. */
export async function timeTokenSignals(secret: string, formKey: string, token: string | undefined, now = Date.now()): Promise<SpamSignal[]> {
  if (!token) return [];
  const [ts, sig] = token.split(".");
  const issued = Number(ts);
  if (!sig || !Number.isFinite(issued) || !safeEqual(sig, await hmacSha256Hex(secret, `${formKey}|${issued}`)))
    return [{ name: "bad_token", weight: 0.6, detail: "time token signature invalid" }];
  const age = now - issued;
  if (age < TOO_FAST_MS) return [{ name: "too_fast", weight: 0.6, detail: `submitted ${Math.max(0, age)} ms after page load` }];
  if (age > STALE_MS) return [{ name: "stale_token", weight: 0.6, detail: "page loaded more than 24 hours ago" }];
  return [];
}
