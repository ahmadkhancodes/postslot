import { normEmail } from "@/lib/security/disposable";
import type { Form } from "./types";

// Parsing and normalisation for POST /f/:key. Pure functions: the route is a thin adapter (docs/ARCHITECTURE.md section 3).

export const MAX_BODY_BYTES = 100 * 1024;
export const MAX_FIELDS = 25;
const MAX_FIELD_NAME = 100;
const MAX_VALUE = 20_000;

export class IngestError extends Error {
  constructor(public status: number, public code: string, public userMessage: string) {
    super(code);
  }
}

export const ERROR_COPY: Record<string, string> = {
  payload_too_large: "This submission is larger than 100 KB. Send fewer or shorter fields.",
  too_many_fields: "This submission has more than 25 fields.",
  files_not_supported: "File uploads are not supported on this form yet.",
  bad_body: "We could not read this submission. Send urlencoded, multipart or JSON data.",
  empty_submission: "This submission has no fields.",
  unknown_form: "This form does not exist. Check the key in the form's action URL.",
  form_paused: "This form is not accepting submissions right now.",
  domain_mismatch: "This form only accepts submissions from the sites its owner allowed.",
  captcha_failed: "The proof-of-work check failed. Reload the page and try again.",
  rate_limited: "Too many submissions. Wait a minute and try again.",
  service_unavailable: "We could not save this submission. Try again in a moment.",
};

export type RawFields = Record<string, string>;

function flat(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(flat).join(", ");
  return JSON.stringify(v);
}

/** Adds a field with name and value bounds. Duplicate names join with ", " (checkbox groups). */
function put(out: RawFields, name: string, value: string) {
  const k = name.slice(0, MAX_FIELD_NAME);
  if (!k || k === "__proto__" || k === "constructor" || k === "prototype") return;
  const v = value.slice(0, MAX_VALUE);
  out[k] = k in out ? `${out[k]}, ${v}` : v;
  if (Object.keys(out).length > MAX_FIELDS) throw new IngestError(422, "too_many_fields", ERROR_COPY.too_many_fields!);
}

export type BodyKind = "json" | "form";

/** Reads and parses the request body with size limits. Never reads unbounded streams into memory. */
export async function parseBody(req: Request): Promise<{ fields: RawFields; kind: BodyKind }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) throw new IngestError(413, "payload_too_large", ERROR_COPY.payload_too_large!);
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  const out: RawFields = {};
  try {
    if (type.includes("multipart/form-data")) {
      const raw = await readBounded(req);
      const fd = await new Response(raw as unknown as BodyInit, { headers: { "content-type": req.headers.get("content-type")! } }).formData();
      for (const [k, v] of fd.entries()) {
        if (typeof v !== "string") throw new IngestError(422, "files_not_supported", ERROR_COPY.files_not_supported!);
        put(out, k, v);
      }
      return { fields: out, kind: "form" };
    }
    const text = new TextDecoder().decode(await readBounded(req));
    if (type.includes("application/json")) {
      const data: unknown = text ? JSON.parse(text) : {};
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new IngestError(422, "bad_body", ERROR_COPY.bad_body!);
      for (const [k, v] of Object.entries(data)) put(out, k, flat(v));
      return { fields: out, kind: "json" };
    }
    for (const [k, v] of new URLSearchParams(text).entries()) put(out, k, v);
    return { fields: out, kind: "form" };
  } catch (e) {
    if (e instanceof IngestError) throw e;
    throw new IngestError(400, "bad_body", ERROR_COPY.bad_body!);
  }
}

async function readBounded(req: Request): Promise<Uint8Array> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new IngestError(413, "payload_too_large", ERROR_COPY.payload_too_large!);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

const SPECIAL = new Set(["_replyto", "replyto", "_subject", "subject", "from_name", "_from_name", "_redirect", "redirect", "_gotcha", "botcheck", "ps_token", "altcha"]);

export interface Normalised {
  fields: RawFields;
  replyTo?: string;
  fromName?: string;
  subject?: string;
  redirect?: string;
  honeypotFilled: boolean;
  psToken?: string;
  altcha?: string;
}

/** Extracts special fields (stripped from `fields`). `email` stays in fields and doubles as Reply-To. */
export function normaliseFields(raw: RawFields): Normalised {
  const fields: RawFields = {};
  for (const [k, v] of Object.entries(raw)) if (!SPECIAL.has(k.toLowerCase())) fields[k] = v;
  const get = (...names: string[]) => {
    for (const n of names) for (const [k, v] of Object.entries(raw)) if (k.toLowerCase() === n && v.trim()) return v.trim();
    return undefined;
  };
  const replyTo = normEmail(get("_replyto", "replyto") ?? raw.email ?? "") ?? undefined;
  const hp = get("_gotcha", "botcheck");
  return {
    fields,
    replyTo,
    fromName: (get("from_name", "_from_name") ?? undefined)?.slice(0, 120),
    subject: (get("_subject", "subject") ?? undefined)?.replace(/[\r\n]+/g, " ").slice(0, 200),
    redirect: get("_redirect", "redirect"),
    honeypotFilled: !!hp && !["false", "0", "off", "no"].includes(hp.toLowerCase()),
    psToken: get("ps_token"),
    altcha: get("altcha"),
  };
}

export function buildSearchText(n: Normalised): string {
  return [...Object.values(n.fields), n.replyTo, n.fromName, n.subject].filter(Boolean).join(" \n").toLowerCase().slice(0, 4000);
}

const hostOf = (entry: string): string | null => {
  const e = entry.trim().toLowerCase();
  if (!e) return null;
  try {
    return new URL(e.includes("://") ? e : `https://${e}`).host;
  } catch {
    return null;
  }
};

/** Domain lock. `*.example.com` matches subdomains. Empty list = no lock. */
export function originAllowed(allowed: string[], origin: string | null | undefined): boolean {
  if (!allowed.length) return true;
  if (!origin) return false;
  let host: string;
  try { host = new URL(origin).host.toLowerCase(); } catch { return false; }
  return allowed.some((a) => {
    const wild = a.trim().startsWith("*.");
    const h = hostOf(wild ? a.trim().slice(2) : a);
    if (!h) return false;
    return wild ? host.endsWith(`.${h}`) : host === h;
  });
}

/** Request origin: Origin header, else Referer's origin. */
export function requestOrigin(req: Request): string | null {
  const o = req.headers.get("origin");
  if (o && o !== "null") return o;
  const ref = req.headers.get("referer");
  try { return ref ? new URL(ref).origin : null; } catch { return null; }
}

/**
 * Where a human post lands. Posted `redirect` is only honoured when its origin is one of the form's allowed
 * origins, the posting origin or our own host (no open redirect); else the form's own success URL; else null.
 */
export function pickRedirect(form: Pick<Form, "redirectUrl" | "allowedOrigins">, posted: string | undefined, origin: string | null, ownOrigin: string): string | null {
  if (posted) {
    try {
      const u = new URL(posted);
      if ((u.protocol === "https:" || u.protocol === "http:") && !u.username) {
        const ok = u.origin === ownOrigin || u.origin === origin || originAllowed(form.allowedOrigins, u.origin) && form.allowedOrigins.length > 0;
        if (ok) return u.toString();
      }
    } catch { /* fall through */ }
  }
  return form.redirectUrl ?? null;
}

export function wantsJson(req: Request, kind: BodyKind): boolean {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json")) return true;
  if (accept.includes("text/html")) return false;
  return kind === "json" || (req.headers.get("content-type") ?? "").includes("application/json");
}
