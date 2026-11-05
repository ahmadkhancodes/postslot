import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { FormPatch, getOwnedForm, updateForm } from "@/lib/forms/store";
import { json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi<Ctx>(async (req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { id } = await params;
  const form = await updateForm(await getDb(), ctx.org.id, id, await readJson(req, FormPatch));
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "form.updated", target: id });
  return json({ form });
});

export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { id } = await params;
  const db = await getDb();
  await getOwnedForm(db, ctx.org.id, id);
  await db.docs("forms").delete({ _id: id });
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "form.deleted", target: id });
  return json({ ok: true });
});
