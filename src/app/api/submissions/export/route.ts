import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { toCsv } from "@/lib/inbox/export";
import { listSubmissions, parseFilter } from "@/lib/inbox/query";
import type { Form } from "@/lib/forms/types";
import { json, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV of the current inbox view (form, filter and search apply), newest first, up to 50,000 rows. */
export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "read");
  const u = new URL(req.url);
  const db = await getDb();
  // Up to 50,000 rows each: 10 exports a minute per workspace keeps one account from tying up the server (S-6).
  if (!(await rateLimit(`csv:${ctx.org.id}`, { limit: 10, windowMs: 60_000 }, db)).ok) return json({ error: "rate_limited" }, 429, { "retry-after": "60" });
  const [rows, forms] = await Promise.all([
    listSubmissions(db, ctx.org.id, { formId: u.searchParams.get("form") ?? undefined, filter: parseFilter(u.searchParams.get("filter")), q: u.searchParams.get("q") ?? undefined, limit: 50_000 }),
    db.docs<Form>("forms").find({ orgId: ctx.org.id }),
  ]);
  const csv = toCsv(rows, Object.fromEntries(forms.map((f) => [f._id, f.name])));
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="postslot-submissions-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
  });
});
