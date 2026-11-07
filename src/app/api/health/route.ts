import { getDb } from "@/lib/db";
import { checkHealth } from "@/lib/health";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 200 when the database answers within 1 s, 503 otherwise, so an uptime monitor can alert. */
export async function GET() {
  const h = await checkHealth(getDb);
  return json({ ok: h.ok, db: h.db, ...(h.error ? { error: h.error } : {}), version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", at: new Date().toISOString() }, h.ok ? 200 : 503);
}
