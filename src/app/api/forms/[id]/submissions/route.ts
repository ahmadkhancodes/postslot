import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getOwnedForm } from "@/lib/forms/store";
import { json, withApi } from "@/lib/http";
import { deleteAllSubmissions } from "@/lib/inbox/purge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deletes every stored submission of this form (spam and held included). The UI asks for a typed confirmation first. */
export const DELETE = withApi<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { id } = await params;
  const db = await getDb();
  await getOwnedForm(db, ctx.org.id, id);
  return json({ deleted: await deleteAllSubmissions(db, ctx.org.id, id, ctx.user.id) });
});
