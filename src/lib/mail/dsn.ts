import { parseVerp } from "./smtp";
import type { MailEvent } from "./events";

// Bounce parser for the own-mail-server path: RFC 3464 delivery status notifications (DSN) and RFC 5965 abuse
// feedback reports (ARF), delivered raw to POST /api/hooks/dsn. Produces the same MailEvents as the provider webhook.

interface Block { headers: Map<string, string> }

/** Parses "Name: value" lines (with folded continuation lines) into a lowercase-keyed map. */
function parseHeaders(text: string): Map<string, string> {
  const map = new Map<string, string>();
  let last: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^[ \t]+/.test(line) && last) { map.set(last, `${map.get(last)} ${line.trim()}`); continue; }
    const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (m) { last = m[1]!.toLowerCase(); if (!map.has(last)) map.set(last, m[2]!.trim()); } else last = null;
  }
  return map;
}

const blocks = (text: string): Block[] => text.split(/\r?\n[ \t]*\r?\n/).map((b) => ({ headers: parseHeaders(b) }));

/** The value after "rfc822;" style type prefixes: "rfc822; user@x.test" -> "user@x.test". */
const afterType = (v: string | undefined) => (v ? v.replace(/^[a-z0-9-]+;\s*/i, "").trim() : undefined);

const idFromMessageId = (v: string | undefined): string | null => {
  const m = v?.match(/<([a-z0-9-]+)@[^>]*>/i);
  return m ? m[1]!.toLowerCase() : null;
};

/** Hard = the address or domain does not exist; block = rejected for policy/reputation (does not suppress); soft = retry. */
export function classifyStatus(status: string | undefined, action: string): "hard" | "soft" | "block" {
  const s = status?.match(/^(\d)\.(\d{1,3})\.(\d{1,3})/);
  if (!s) return action === "delayed" ? "soft" : "hard";
  const [cls, subject, detail] = [s[1]!, Number(s[2]), Number(s[3])];
  if (cls === "4" || action === "delayed") return "soft";
  if (subject === 2 && (detail === 2 || detail === 3)) return "soft"; // mailbox full, message too large for now
  if (subject === 7 || subject === 4 && detail === 7) return "block"; // security or policy
  if (subject === 3 && detail === 5) return "block";
  return "hard";
}

export interface ParsedDsn { events: MailEvent[]; kind: "dsn" | "arf" | "none" }

/**
 * `raw` is the whole inbound message (headers and MIME body). The message id comes from, in order:
 * the VERP return path in the envelope headers, our X-Postslot-Id header, or the original Message-ID in the embedded copy.
 */
export function parseDsn(raw: string, now = new Date()): ParsedDsn {
  const text = raw.replace(/\r\n/g, "\n");
  const bs = blocks(text);
  const top = bs[0]?.headers ?? new Map<string, string>();

  // Message id: VERP in Delivered-To / X-Original-To / To / Envelope-To, else our header, else embedded Message-ID.
  let messageId: string | null = null;
  let verpRecipient: string | undefined;
  for (const h of ["delivered-to", "x-original-to", "envelope-to", "to"]) {
    const v = top.get(h);
    const verp = v ? parseVerp(v) : null;
    if (verp) { messageId = verp.messageId; verpRecipient = verp.recipient; break; }
  }
  if (!messageId) {
    for (const b of bs) {
      const x = b.headers.get("x-postslot-id");
      if (x && /^[a-z0-9-]+$/i.test(x)) { messageId = x.toLowerCase(); break; }
    }
  }
  if (!messageId) {
    // Embedded original: the Message-ID in a later block (the top block's own Message-ID is the DSN itself).
    for (const b of bs.slice(1)) {
      const id = idFromMessageId(b.headers.get("message-id")) ?? idFromMessageId(b.headers.get("original-message-id"));
      if (id) { messageId = id; break; }
    }
  }
  const eventId = top.get("message-id") ? `dsn:${top.get("message-id")}` : undefined;

  const arf = bs.find((b) => /abuse|fraud|virus|other/i.test(b.headers.get("feedback-type") ?? "") && b.headers.has("feedback-type"));
  if (arf) {
    const id = messageId ?? idFromMessageId(arf.headers.get("original-mail-from")) ?? idFromMessageId(arf.headers.get("original-message-id"));
    const recipient = (afterType(arf.headers.get("original-rcpt-to")) ?? verpRecipient)?.replace(/[<>]/g, "").toLowerCase();
    if (!id) return { events: [], kind: "none" };
    return { kind: "arf", events: [{ id: eventId, messageId: id, type: "complaint", at: now, recipient, detail: "marked as spam by the recipient" }] };
  }

  const events: MailEvent[] = [];
  for (const b of bs) {
    const action = b.headers.get("action")?.toLowerCase().split(/\s/)[0];
    const finalRcpt = afterType(b.headers.get("final-recipient")) ?? afterType(b.headers.get("original-recipient"));
    if (!action || !finalRcpt) continue;
    const recipient = (finalRcpt.replace(/[<>]/g, "").toLowerCase()) || verpRecipient;
    const status = b.headers.get("status");
    const diagnostic = afterType(b.headers.get("diagnostic-code"))?.replace(/^smtp;\s*/i, "").slice(0, 300);
    const detail = [status, diagnostic].filter(Boolean).join(" ").trim() || undefined;
    const id = messageId;
    if (!id) continue;
    const base = { id: eventId ? `${eventId}|${recipient}` : undefined, messageId: id, at: now, recipient, detail };
    if (action === "failed") events.push({ ...base, type: "returned", classification: classifyStatus(status, action) });
    else if (action === "delayed") events.push({ ...base, type: "deferred" });
    else if (action === "delivered") events.push({ ...base, type: "accepted" });
    // relayed / expanded: handed to another system, no final verdict. Ignored on purpose.
  }
  return { events, kind: events.length ? "dsn" : "none" };
}

/** Webhook body to raw message: accepts the message as text, or JSON {raw}. */
export function rawFromBody(body: string, contentType: string | null): string {
  if (contentType?.includes("json")) {
    try {
      const o = JSON.parse(body) as { raw?: unknown; message?: unknown };
      const r = o.raw ?? o.message;
      return typeof r === "string" ? r : "";
    } catch { return ""; }
  }
  return body;
}
