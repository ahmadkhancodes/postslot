import { getDb } from "@/lib/db";
import { CORS, timeTokenSecret } from "@/lib/forms/handler";
import { isFormKey } from "@/lib/forms/keys";
import { issueTimeToken } from "@/lib/spam/timetoken";
import type { Form } from "@/lib/forms/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed time token for ps.js (written into the hidden ps_token field on page load). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const form = isFormKey(key) ? await (await getDb()).docs<Form>("forms").findOne({ key }) : null;
  if (!form) return new Response(JSON.stringify({ error: "unknown_form" }), { status: 404, headers: { ...CORS, "content-type": "application/json" } });
  return new Response(JSON.stringify({ token: await issueTimeToken(timeTokenSecret(), key) }), {
    headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
