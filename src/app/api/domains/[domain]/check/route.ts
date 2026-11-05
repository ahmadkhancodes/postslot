import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { runCheck } from "@/lib/domains";
import { HttpError, json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = withApi(async (_req, { params }: { params: Promise<{ domain: string }> }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const db = await getDb();
  if ((await db.hitRateLimit(`domain-check:${ctx.org.id}`, 60_000)) > 10) throw new HttpError(429, "rate_limited");
  const d = await runCheck(db, ctx.org.id, domain);
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "domain.checked", target: domain, meta: { verified: !!d.verified } });
  return json({ domain: d });
});
