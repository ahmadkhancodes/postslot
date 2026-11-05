import { fromB64url, safeEqual } from "@/lib/ids";

// MailEvent interface (docs/ARCHITECTURE.md section 4): the dashboard, timeline and bounce logic only know this shape.
// Today the provider webhook produces it; later KumoMTA/Haraka log hooks produce the same events.
export type MailEventType = "dispatched" | "accepted" | "deferred" | "returned" | "complaint";

export interface MailEvent {
  /** Idempotency key from the source when it has one. */
  id?: string;
  /** The transport's message id (SendResult.id). */
  messageId: string;
  type: MailEventType;
  at: Date;
  detail?: string;
  recipient?: string;
  classification?: "hard" | "soft" | "block";
}

export interface MailEventSource {
  name: string;
  /** Throws on a bad signature. Returns zero or more normalised events. */
  verifyAndParse(req: Request, rawBody: string): Promise<MailEvent[]>;
}

const b64decode = (s: string) => {
  try { return fromB64url(s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")); } catch { return null; }
};

/** Svix style signature (used by Resend): HMAC-SHA256 over `${id}.${timestamp}.${body}`, base64, header "v1,<sig> v1,<sig>". */
export async function verifySvix(secret: string, headers: Headers, body: string, now = Date.now(), toleranceMs = 5 * 60_000): Promise<boolean> {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigs = headers.get("svix-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(now - Number(ts) * 1000) > toleranceMs) return false;
  const raw = b64decode(secret.replace(/^whsec_/, ""));
  if (!raw) return false;
  const key = await crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  let bin = "";
  for (const b of mac) bin += String.fromCharCode(b);
  const expected = btoa(bin);
  return sigs.split(" ").some((p) => {
    const [v, s] = p.split(",");
    return v === "v1" && !!s && safeEqual(s, expected);
  });
}

interface ResendPayload {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string }; reason?: string };
}

/** Provider event names to our types. Provider "delivered" means accepted by the recipient's mail server. */
export function mapResendEvent(p: ResendPayload, svixId?: string): MailEvent | null {
  const messageId = p.data?.email_id;
  if (!messageId || !p.type) return null;
  const to = Array.isArray(p.data?.to) ? p.data!.to![0] : p.data?.to;
  const base = { id: svixId, messageId, at: p.created_at ? new Date(p.created_at) : new Date(), recipient: to?.toLowerCase() };
  switch (p.type) {
    case "email.sent": return { ...base, type: "dispatched" };
    case "email.delivered": return { ...base, type: "accepted" };
    case "email.delivery_delayed": return { ...base, type: "deferred", detail: p.data?.reason };
    case "email.bounced": {
      const t = (p.data?.bounce?.type ?? "").toLowerCase();
      const classification = t.includes("transient") || t.includes("temporary") ? "soft" : t.includes("undetermined") ? "block" : "hard";
      return { ...base, type: "returned", classification, detail: p.data?.bounce?.message ?? p.data?.bounce?.subType };
    }
    case "email.complained": return { ...base, type: "complaint" };
    default: return null;
  }
}

export function resendEventSource(secret: string): MailEventSource {
  return {
    name: "resend",
    async verifyAndParse(req, rawBody) {
      if (!(await verifySvix(secret, req.headers, rawBody))) throw new Error("bad_signature");
      const ev = mapResendEvent(JSON.parse(rawBody) as ResendPayload, req.headers.get("svix-id") ?? undefined);
      return ev && !Number.isNaN(ev.at.getTime()) ? [ev] : [];
    },
  };
}
