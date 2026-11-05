import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { previewNotification } from "@/lib/delivery/templates";
import { getOwnedForm } from "@/lib/forms/store";
import { json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preview of the notification with sample data. Same renderer as the real send; `template` and `subject` preview unsaved choices. */
export const GET = withApi<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "read");
  const { id } = await params;
  const form = await getOwnedForm(await getDb(), ctx.org.id, id);
  const q = new URL(req.url).searchParams;
  const t = q.get("template");
  const template = t === "compact" || t === "plain" || t === "default" ? t : form.template;
  const subjectTemplate = (q.get("subject") ?? form.subjectTemplate).slice(0, 200);
  return json(previewNotification({ ...form, template, subjectTemplate }));
});
