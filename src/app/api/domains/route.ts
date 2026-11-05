import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { requirePlan } from "@/lib/billing/entitlement";
import { product } from "@/config/product";
import { getDb } from "@/lib/db";
import { addDomain, type SenderDomain } from "@/lib/domains";
import { json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "read");
  return json({ domains: await (await getDb()).docs<SenderDomain>("sender_domains").find({ orgId: ctx.org.id }, { sort: { createdAt: 1 } }) });
});

export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { domain } = await readJson(req, z.object({ domain: z.string().trim().min(3).max(260) }));
  const db = await getDb();
  requirePlan(await db.getEntitlement(ctx.org.id), product.sending.minPlan);
  const d = await addDomain(db, ctx.org.id, domain);
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "domain.added", target: d.domain });
  return json({ domain: d }, 201);
});
