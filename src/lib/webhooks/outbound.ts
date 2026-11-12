import { getDb } from "@/lib/db";
import { DELIVERY_TTL_DAYS, type Db, type WebhookDelivery, type WebhookEndpoint } from "@/lib/db/types";
import { hmacSha256Hex, randomToken, uuidv7 } from "@/lib/ids";
import { product } from "@/config/product";

// Outbound webhooks: HMAC-SHA256 signed (Stripe-style header), retries with exponential backoff, delivery log.
// Header: `X-Webhook-Signature: t=<unix>,v1=<hex hmac of "t.body">`, plus X-Webhook-Id / X-Webhook-Event.

export const MAX_ATTEMPTS = 8;
/** Backoff after attempt n (1-based): 30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h (+-10% jitter). */
const BACKOFF_S = [30, 120, 600, 1800, 3600, 10800, 21600, 43200];
export function backoffMs(attempt: number, rand = Math.random): number {
  const base = BACKOFF_S[Math.min(attempt - 1, BACKOFF_S.length - 1)]! * 1000;
  return Math.round(base * (0.9 + rand() * 0.2));
}

export const newWebhookSecret = () => `whsec_${randomToken(24)}`;

export async function signPayload(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`;
}

/** For receivers and tests: verify a signature header with a 5 minute tolerance. */
export async function verifySignature(secret: string, body: string, header: string, now = Date.now(), toleranceS = 300) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > toleranceS) return false;
  return parts.v1 === (await hmacSha256Hex(secret, `${t}.${body}`));
}

/** Queue an event to every enabled endpoint subscribed to it (or to "*"), and try once immediately. */
export async function emitEvent(orgId: string, event: string, data: unknown, opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; formId?: string } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  // An endpoint with a formId only gets that form's events; org-wide endpoints (no formId) get everything they subscribed to.
  const eps = (await db.listWebhookEndpoints(orgId)).filter((e) => e.enabled && (!e.formId || e.formId === opts.formId) && (e.events.includes("*") || e.events.includes(event)));
  const out: WebhookDelivery[] = [];
  for (const ep of eps) {
    const id = uuidv7();
    const payload = JSON.stringify({ id, type: event, created: Math.floor(now.getTime() / 1000), data });
    const d: WebhookDelivery = {
      id, app: db.app, orgId, endpointId: ep.id, event, payload, status: "pending", attempts: 0,
      nextAttemptAt: now, lastStatusCode: null, lastError: null, createdAt: now, updatedAt: now,
      expireAt: new Date(now.getTime() + DELIVERY_TTL_DAYS * 864e5),
    };
    await db.createDelivery(d);
    out.push(await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now }));
  }
  return out;
}

export async function attemptDelivery(
  d: WebhookDelivery,
  ep: WebhookEndpoint,
  opts: { db: Db; fetchFn?: typeof fetch; now?: Date },
): Promise<WebhookDelivery> {
  const now = opts.now ?? new Date();
  const fetchFn = opts.fetchFn ?? fetch;
  const attempts = d.attempts + 1;
  let code: number | null = null;
  let error: string | null = null;
  try {
    const headers = {
      "content-type": "application/json",
      "user-agent": `${product.name}-Webhooks/1.0`,
      "x-webhook-id": d.id,
      "x-webhook-event": d.event,
      "x-webhook-signature": await signPayload(ep.secret, d.payload, Math.floor(now.getTime() / 1000)),
    };
    if (!opts.fetchFn && process.env.NODE_ENV === "production") {
      // Real network: the host must resolve to public addresses, checked on the address actually connected to, so a
      // DNS name that points (or re-points, DNS rebinding) at a private or link-local address cannot reach internal services.
      if (!(await resolvesPublic(new URL(ep.url).hostname))) throw Object.assign(new Error("unsafe_target"), { name: "UnsafeTarget" });
      code = await pinnedPost(ep.url, headers, d.payload, 10_000);
    } else {
      const res = await fetchFn(ep.url, { method: "POST", signal: AbortSignal.timeout(10_000), redirect: "manual", headers, body: d.payload });
      code = res.status;
      await res.body?.cancel().catch(() => undefined);
    }
    if (code < 200 || code > 299) error = `http_${code}`;
  } catch (e) {
    const name = (e as Error).name;
    error = name === "TimeoutError" ? "timeout" : name === "UnsafeTarget" ? "unsafe_target" : "network_error";
  }
  const ok = !error;
  const patch: Partial<WebhookDelivery> = {
    attempts,
    lastStatusCode: code,
    lastError: error,
    updatedAt: now,
    status: ok ? "succeeded" : attempts >= MAX_ATTEMPTS ? "failed" : "retrying",
    nextAttemptAt: ok || attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + backoffMs(attempts)),
  };
  await opts.db.updateDelivery(d.id, patch);
  return { ...d, ...patch };
}

/** Replay a logged delivery: a new delivery with the same payload and event, sent now (the receiver dedupes on `id`). */
export async function replayDelivery(orgId: string, deliveryId: string, opts: { db?: Db; fetchFn?: typeof fetch; now?: Date } = {}): Promise<WebhookDelivery | null> {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const old = await db.getDelivery(orgId, deliveryId);
  const ep = old && (await db.getWebhookEndpoint(orgId, old.endpointId));
  if (!old || !ep) return null;
  const id = uuidv7();
  const payload = JSON.stringify({ ...(JSON.parse(old.payload) as object), id, replayOf: old.id });
  const d: WebhookDelivery = {
    id, app: db.app, orgId, endpointId: ep.id, event: old.event, payload, status: "pending", attempts: 0, nextAttemptAt: now,
    lastStatusCode: null, lastError: null, createdAt: now, updatedAt: now, expireAt: new Date(now.getTime() + DELIVERY_TTL_DAYS * 864e5),
  };
  await db.createDelivery(d);
  return attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now });
}

/** Cron job: retry due deliveries. */
export async function retryDueDeliveries(opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; limit?: number } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const due = await db.dueDeliveries(now, opts.limit ?? 50);
  let ok = 0;
  for (const d of due) {
    const ep = await db.getWebhookEndpoint(d.orgId, d.endpointId);
    if (!ep || !ep.enabled) {
      await db.updateDelivery(d.id, { status: "failed", lastError: "endpoint_disabled", nextAttemptAt: null, updatedAt: now });
      continue;
    }
    const r = await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now });
    if (r.status === "succeeded") ok++;
  }
  return { processed: due.length, succeeded: ok };
}

/** Block private/loopback targets (SSRF) for user-supplied webhook URLs. */
export function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && u.protocol === "http:")) return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) && isPrivateIp(h)) return false; // the URL parser already turned 0x7f.1, 2130706433 etc. into dotted form
  if (h.startsWith("[") || h === "::1") return false;
  return true;
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and unspecified IPv4/IPv6 addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
}

/** Resolves every address of `host`; false when any is private or the lookup fails. */
export async function resolvesPublic(host: string, lookup: (h: string) => Promise<{ address: string }[]> = defaultLookup): Promise<boolean> {
  try {
    const addrs = await lookup(host.replace(/^\[|\]$/g, ""));
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

async function defaultLookup(h: string) {
  const { lookup } = await import("node:dns/promises");
  return lookup(h, { all: true, verbatim: true });
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void;

/**
 * dns.lookup for outbound webhook sockets: fails when any address of the host is private, so the address the socket
 * connects to is the one that was checked (no window between the check and the connection; docs/SECURITY-REVIEW.md S-3).
 */
export function safeLookup(
  hostname: string,
  options: { all?: boolean; family?: number | string } | number | undefined,
  cb: LookupCb,
  lookup: (h: string) => Promise<{ address: string; family: number }[]> = defaultLookup,
): void {
  lookup(hostname).then((addrs) => {
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
      cb(Object.assign(new Error("unsafe_target"), { name: "UnsafeTarget", code: "EUNSAFE" }), "", 4);
      return;
    }
    if (typeof options === "object" && options?.all) cb(null, addrs);
    else cb(null, addrs[0]!.address, addrs[0]!.family);
  }, (e: NodeJS.ErrnoException) => cb(e, "", 4));
}

/** POST without following redirects, body of the answer discarded, total time capped. Returns the status code. */
export async function pinnedPost(url: string, headers: Record<string, string>, body: string, timeoutMs: number, lookup: typeof safeLookup = safeLookup): Promise<number> {
  const u = new URL(url);
  const mod = u.protocol === "https:" ? await import("node:https") : await import("node:http");
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method: "POST", headers: { ...headers, "content-length": String(Buffer.byteLength(body)) }, lookup: lookup as never, signal: AbortSignal.timeout(timeoutMs) }, (res) => {
      res.resume(); // never buffer the receiver's answer
      resolve(res.statusCode ?? 0);
    });
    req.on("error", (e) => reject(e.name === "AbortError" ? Object.assign(new Error("timeout"), { name: "TimeoutError" }) : (e as Error & { code?: string }).code === "EUNSAFE" ? Object.assign(new Error("unsafe_target"), { name: "UnsafeTarget" }) : e));
    req.end(body);
  });
}
