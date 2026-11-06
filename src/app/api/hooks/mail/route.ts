import { getDb } from "@/lib/db";
import { applyMailEvent, retryableUnknown } from "@/lib/delivery/events";
import { env } from "@/lib/env";
import { json } from "@/lib/http";
import { log } from "@/lib/logger";
import { resendEventSource } from "@/lib/mail/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Provider delivery events (accepted, deferred, bounced, complaint). Signature verified, idempotent. No CSRF: server to server. */
export async function POST(req: Request) {
  const secret = env().MAIL_WEBHOOK_SECRET;
  if (!secret) return json({ error: "not_configured" }, 503);
  const raw = await req.text();
  if (raw.length > 100_000) return json({ error: "body_too_large" }, 413);
  let events;
  try {
    events = await resendEventSource(secret).verifyAndParse(req, raw);
  } catch {
    return json({ error: "bad_signature" }, 401);
  }
  const db = await getDb();
  const results: string[] = [];
  for (const ev of events) {
    try {
      results.push(await applyMailEvent(db, ev));
    } catch (e) {
      log.error("mail_event_failed", { message: (e as Error).message });
      return json({ error: "server_error" }, 500); // the provider retries
    }
  }
  // Event for a message id we have not saved yet (the send call has not returned): let the provider retry it.
  if (retryableUnknown(events, results)) return json({ error: "message_not_yet_known", results }, 409);
  return json({ ok: true, results });
}
