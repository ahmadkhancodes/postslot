import { z } from "zod";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { markSpam, redeliver, releaseSubmission } from "@/lib/delivery/process";
import { getDetail } from "@/lib/inbox/query";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>(async (_req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "read");
  const { id } = await params;
  const d = await getDetail(await getDb(), ctx.org.id, id);
  if (!d) throw new HttpError(404, "not_found");
  return json(d);
});

/** Actions: not_spam (release + train), spam (quarantine + train), redeliver (new deliveries, own timeline). */
export const POST = withApi<Ctx>(async (req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { id } = await params;
  const { action } = await readJson(req, z.object({ action: z.enum(["not_spam", "spam", "redeliver"]) }));
  const db = await getDb();
  if (action === "not_spam") {
    const s = await releaseSubmission(db, id, ctx.org.id, ctx.user.id);
    if (!s) throw new HttpError(404, "not_found");
    return json({ status: s.status });
  }
  if (action === "spam") {
    const s = await markSpam(db, id, ctx.org.id);
    if (!s) throw new HttpError(404, "not_found");
    return json({ status: s.status });
  }
  if (!(await rateLimit(`redeliver:${ctx.org.id}`, { limit: 30, windowMs: 3600_000 }, db)).ok) throw new HttpError(429, "rate_limited");
  const result = await redeliver(db, id, ctx.org.id);
  if (result === "not_found") throw new HttpError(404, "not_found");
  if (result !== "ok") throw new HttpError(409, result);
  return json({ ok: true });
});
