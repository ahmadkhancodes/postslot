import { json } from "@/lib/http";
import { newChallenge } from "@/lib/security/altcha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Customer forms live on other origins, so the widget fetches this cross-origin: without CORS the browser hides the
// challenge, the widget never solves, and every submission to a form with ALTCHA on would be rejected.
const ALTCHA_CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" };

/** ALTCHA challenge for the <altcha-widget challengeurl="https://<host>/api/altcha"> on public forms. Public, no cookies. */
export async function GET() {
  return json(await newChallenge(), 200, ALTCHA_CORS);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: ALTCHA_CORS });
}
