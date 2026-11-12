import { z } from "zod";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { markSpam, releaseSubmission } from "@/lib/delivery/process";
import { json, readJson, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BULK_MAX = 100;

/**
 * Bulk "Not spam" / "Mark spam" for up to 100 submissions of the caller's workspace.
 * Ids that are not theirs, do not exist or are in the wrong state are counted as `skipped`, never errors, so guessed ids reveal nothing.
 */
export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { action, ids } = await readJson(req, z.object({ action: z.enum(["not_spam", "spam"]), ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_MAX) }));
  const db = await getDb();
  if (!(await rateLimit(`bulk:${ctx.org.id}`, { limit: 20, windowMs: 60_000 }, db)).ok) return json({ error: "rate_limited" }, 429, { "retry-after": "60" });
  let done = 0;
  let skipped = 0;
  for (const id of [...new Set(ids)]) {
    try {
      const s = action === "not_spam" ? await releaseSubmission(db, id, ctx.org.id, ctx.user.id) : await markSpam(db, id, ctx.org.id);
      if (s) done++; else skipped++;
    } catch {
      skipped++;
    }
  }
  return json({ done, skipped });
});
