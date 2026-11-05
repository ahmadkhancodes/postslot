import { z } from "zod";
import { getDb } from "@/lib/db";
import { verifyRecipient } from "@/lib/forms/recipients";
import { HttpError, clientIp, json, readJson, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Confirms a recipient address from the emailed link (public, token is the credential). */
export const POST = withApi(async (req) => {
  const db = await getDb();
  if (!(await rateLimit(`verify:${clientIp(req)}`, { limit: 20, windowMs: 600_000 }, db)).ok) throw new HttpError(429, "rate_limited");
  const { token } = await readJson(req, z.object({ token: z.string().min(10).max(200) }));
  const r = await verifyRecipient(db, token);
  if (!r) throw new HttpError(400, "invalid_token");
  return json(r);
});
