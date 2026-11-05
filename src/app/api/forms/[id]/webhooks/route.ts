import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getOwnedForm } from "@/lib/forms/store";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { isSafeWebhookUrl, newWebhookSecret } from "@/lib/webhooks/outbound";
import { SUBMISSION_EVENTS, listFormWebhooks, webhookSlotAvailable, webhooksAllowed } from "@/lib/webhooks/submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const Create = z.object({ url: z.string().url().max(2048), events: z.array(z.enum(SUBMISSION_EVENTS)).min(1).max(SUBMISSION_EVENTS.length) });

export const GET = withApi<Ctx>(async (_req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "webhook", "read");
  const { id } = await params;
  const db = await getDb();
  await getOwnedForm(db, ctx.org.id, id);
  return json({ allowed: await webhooksAllowed(db, ctx.org.id), endpoints: await listFormWebhooks(db, ctx.org.id, id) });
});

/** Plan gate: Starter and above (docs/brief.md). The signing secret is returned once. */
export const POST = withApi<Ctx>(async (req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "webhook", "manage");
  const { id } = await params;
  const body = await readJson(req, Create);
  if (!isSafeWebhookUrl(body.url)) throw new HttpError(400, "unsafe_url");
  const db = await getDb();
  await getOwnedForm(db, ctx.org.id, id);
  if (!(await webhooksAllowed(db, ctx.org.id))) throw new HttpError(403, "plan_required", { feature: "webhooks" });
  if (!(await webhookSlotAvailable(db, ctx.org.id))) throw new HttpError(403, "plan_required", { feature: "webhooks", meter: "integrations" });
  if ((await listFormWebhooks(db, ctx.org.id, id)).length >= 5) throw new HttpError(400, "too_many_endpoints");
  const secret = newWebhookSecret();
  const ep = await db.createWebhookEndpoint({ id: uuidv7(), orgId: ctx.org.id, formId: id, url: body.url, events: body.events, enabled: true, secret });
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "webhook.created", target: ep.id, meta: { form: id } });
  const { secret: _s, ...endpoint } = ep;
  return json({ endpoint, secret }, 201);
});
