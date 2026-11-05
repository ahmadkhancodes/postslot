import { after } from "next/server";
import { getDb } from "@/lib/db";
import { CORS, handleFormPost } from "@/lib/forms/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Public form endpoint. No CSRF check by design: the key is public and the domain lock is the origin check. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  let db;
  try {
    db = await getDb();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "service_unavailable", message: "We could not save this submission. Try again in a moment." }), {
      status: 503, headers: { ...CORS, "content-type": "application/json", "retry-after": "30", "cache-control": "no-store" },
    });
  }
  const { response, background } = await handleFormPost(db, req, key);
  if (background) after(background);
  return response;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export function GET() {
  return new Response(JSON.stringify({ success: false, error: "method_not_allowed", message: "Send a POST request to this URL." }), {
    status: 405, headers: { ...CORS, allow: "POST, OPTIONS", "content-type": "application/json", "x-robots-tag": "noindex" },
  });
}
