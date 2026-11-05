import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { SenderDomain } from "@/lib/domains";
import { json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withApi(async (_req, { params }: { params: Promise<{ domain: string }> }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const n = await (await getDb()).docs<SenderDomain>("sender_domains").delete({ _id: `${ctx.org.id}|${domain}`, orgId: ctx.org.id });
  if (n) await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "domain.removed", target: domain });
  return json({ ok: true });
});
