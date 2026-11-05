import { z } from "zod";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { unsuppressRecipient } from "@/lib/delivery/process";
import { getDb } from "@/lib/db";
import { getOwnedForm } from "@/lib/forms/store";
import { sendVerification } from "@/lib/forms/recipients";
import type { Form, Recipient } from "@/lib/forms/types";
import { HttpError, json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; rid: string }> };

async function load(ctx: Ctx) {
  const org = await requireOrg();
  requirePermission(org, "data", "write");
  const { id, rid } = await ctx.params;
  const db = await getDb();
  const form = await getOwnedForm(db, org.org.id, id);
  const r = await db.docs<Recipient>("recipients").get(decodeURIComponent(rid));
  if (!r || r.orgId !== org.org.id || !form.recipientIds.includes(r._id)) throw new HttpError(404, "not_found");
  return { org, db, form, r };
}

/** { action: "resend" } resends the confirmation link; { action: "unsuppress" } clears a bounce (max 3 a day). */
export const POST = withApi<Ctx>(async (req, ctx) => {
  const { action } = await readJson(req, z.object({ action: z.enum(["resend", "unsuppress"]) }));
  const { org, db, r } = await load(ctx);
  if (action === "resend") return json({ sent: await sendVerification(db, r) });
  const res = await unsuppressRecipient(db, org.org.id, r._id);
  if (res === "limit") throw new HttpError(429, "rate_limited");
  if (res === "not_found") throw new HttpError(404, "not_found");
  return json({ ok: true });
});

export const DELETE = withApi<Ctx>(async (_req, ctx) => {
  const { db, form, r } = await load(ctx);
  await db.docs<Form>("forms").update({ _id: form._id }, { recipientIds: form.recipientIds.filter((x) => x !== r._id) });
  return json({ ok: true });
});
