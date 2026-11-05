import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getOwnedForm } from "@/lib/forms/store";
import { HttpError, json, withApi } from "@/lib/http";
import { sendTestSubmission } from "@/lib/onboarding/test-submission";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Send test submission": a labelled test through the real pipeline. Not metered. Returns the receipt. */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { id } = await params;
  const db = await getDb();
  const form = await getOwnedForm(db, ctx.org.id, id);
  if (form.status !== "active") throw new HttpError(403, "form_paused");
  if (!(await rateLimit(`test-submission:${form._id}`, { limit: 10, windowMs: 3600_000 }, db)).ok) throw new HttpError(429, "rate_limited");
  const receipt = await sendTestSubmission(db, form, { email: ctx.user.email });
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "form.test_submission", target: form._id });
  return json({ receipt });
});
