import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { FounderAction, assertFounder, runFounderAction } from "@/lib/founder";
import { json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Founder admin writes. One endpoint, one validated action union; each call appends an audit entry. */
export const POST = withApi(async (req) => {
  const { user } = await requireUser();
  assertFounder(user.email);
  const input = await readJson(req, FounderAction);
  await runFounderAction(await getDb(), { id: user.id, email: user.email }, input);
  return json({ ok: true });
});
