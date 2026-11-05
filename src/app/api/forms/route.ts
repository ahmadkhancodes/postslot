import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { createForm } from "@/lib/forms/store";
import type { Form, Recipient } from "@/lib/forms/types";
import { json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "read");
  const db = await getDb();
  const [forms, recipients] = await Promise.all([
    db.docs<Form>("forms").find({ orgId: ctx.org.id }, { sort: { createdAt: -1 }, limit: 200 }),
    db.docs<Recipient>("recipients").find({ orgId: ctx.org.id }),
  ]);
  return json({ forms, recipients: recipients.map(({ verifyTokenHash: _h, ...r }) => r) });
});

export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { name } = await readJson(req, z.object({ name: z.string().trim().min(1).max(80) }));
  const db = await getDb();
  const form = await createForm(db, { orgId: ctx.org.id, userEmail: ctx.user.email, emailVerified: ctx.user.emailVerified }, name);
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "form.created", target: form._id });
  return json({ form }, 201);
});
