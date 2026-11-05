import { getDb } from "@/lib/db";
import { applyMailEvent } from "@/lib/delivery/events";
import { env } from "@/lib/env";
import { json } from "@/lib/http";
import { safeEqual } from "@/lib/ids";
import { log } from "@/lib/logger";
import { parseDsn, rawFromBody } from "@/lib/mail/dsn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound bounces from our own mail server (docs/OWN_MTA.md). The MTA pipes the bounce mailbox here as a raw
 * message (or JSON {raw}). Auth: shared secret in `Authorization: Bearer` or `x-webhook-secret` (DSN_WEBHOOK_SECRET).
 */
export async function POST(req: Request) {
  const secret = env().DSN_WEBHOOK_SECRET;
  if (!secret) return json({ error: "not_configured" }, 503);
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(given, secret)) return json({ error: "unauthorized" }, 401);
  const body = await req.text();
  if (body.length > 500_000) return json({ error: "body_too_large" }, 413);
  const parsed = parseDsn(rawFromBody(body, req.headers.get("content-type")));
  const db = await getDb();
  const results: string[] = [];
  for (const ev of parsed.events) {
    try {
      results.push(await applyMailEvent(db, ev));
    } catch (e) {
      log.error("dsn_event_failed", { message: (e as Error).message });
      return json({ error: "server_error" }, 500); // the MTA retries the hook
    }
  }
  return json({ ok: true, kind: parsed.kind, results });
}
