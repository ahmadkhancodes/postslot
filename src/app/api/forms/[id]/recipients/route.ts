import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getOwnedForm, ensureRecipient } from "@/lib/forms/store";
import type { Form } from "@/lib/forms/types";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Adds a recipient to the form and emails the confirmation link. No content is sent until it is confirmed. */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { id } = await params;
  const { email } = await readJson(req, z.object({ email: z.string().trim().email().max(254) }));
  const db = await getDb();
  const form = await getOwnedForm(db, ctx.org.id, id);
  if (!(await rateLimit(`recipient:${ctx.org.id}`, { limit: 20, windowMs: 3600_000 }, db)).ok) throw new HttpError(429, "rate_limited");
  const r = await ensureRecipient(db, ctx.org.id, email, { verified: email.toLowerCase() === ctx.user.email.toLowerCase() && ctx.user.emailVerified });
  if (!r) throw new HttpError(400, "invalid_body");
  if (!form.recipientIds.includes(r._id)) await db.docs<Form>("forms").update({ _id: form._id }, { recipientIds: [...form.recipientIds, r._id] });
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "recipient.added", target: r._id });
  const { verifyTokenHash: _h, ...safe } = r;
  return json({ recipient: safe }, 201);
});
