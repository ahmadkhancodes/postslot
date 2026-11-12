import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { scopeOrgExport } from "@/lib/account-export";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's role in one workspace (null when not a member any more). */
async function roleIn(orgId: string, h: Headers, userId: string) {
  const auth = await getAuth();
  const full = (await auth.api.getFullOrganization({ headers: h, query: { organizationId: orgId } }).catch(() => null)) as { members?: { userId: string; role: string }[] } | null;
  return full?.members?.find((m) => m.userId === userId)?.role ?? null;
}

/** GET /api/account/export: JSON of the user's data and every org they belong to (new; neither app had it). */
export const GET = withApi(async () => {
  const { user } = await requireUser();
  const db = await getDb();
  await enforceRateLimit(`export:${user.id}`, RULES.account, db);
  const auth = await getAuth();
  const h = await headers();
  const orgs = (await auth.api.listOrganizations({ headers: h })) as { id: string; name: string; slug: string; createdAt?: Date }[];
  const sessions = await auth.api.listSessions({ headers: h }).catch(() => []);
  const data = {
    exportedAt: new Date().toISOString(),
    user,
    sessions: (sessions as { id: string; createdAt: Date; userAgent?: string | null; ipAddress?: string | null }[]).map((s) => ({ id: s.id, createdAt: s.createdAt, userAgent: s.userAgent, ipAddress: s.ipAddress })),
    organizations: await Promise.all(orgs.map(async (o) => ({ ...o, data: scopeOrgExport(await db.exportOrgData(o.id), await roleIn(o.id, h, user.id)) }))),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${db.app}-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
