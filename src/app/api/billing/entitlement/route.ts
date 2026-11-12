import { product, type MeterId } from "@/config/product";
import { requireOrg } from "@/lib/auth/session";
import { computeEntitlement, effectivePlan } from "@/lib/billing/entitlement";
import { getStripe } from "@/lib/billing/stripe";
import { currentUsage } from "@/lib/billing/usage";
import { getDb } from "@/lib/db";
import { releaseHeld } from "@/lib/delivery/process";
import { log } from "@/lib/logger";
import { json, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?refresh=1 asks Stripe directly so a plan unlocks right after checkout without waiting for the webhook (C-13). */
export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  const db = await getDb();
  let ent = await db.getEntitlement(ctx.org.id);
  const stripe = getStripe();
  // Each refresh costs Stripe API calls on our shared key: 10 a minute per workspace (docs/SECURITY-REVIEW.md S-6).
  if (new URL(req.url).searchParams.get("refresh") === "1") {
    if (!(await rateLimit(`entrefresh:${ctx.org.id}`, { limit: 10, windowMs: 60_000 }, db)).ok) return json({ error: "rate_limited" }, 429, { "retry-after": "60" });
  }
  if (new URL(req.url).searchParams.get("refresh") === "1" && stripe) {
    const acct = await db.getBillingAccount(ctx.org.id);
    if (acct?.stripeCustomerId) {
      ent = await computeEntitlement(stripe, db.app, acct.stripeCustomerId, ent, Date.now());
      await db.setEntitlement(ctx.org.id, ent);
      // Upgrade: release held submissions now instead of waiting for the Stripe webhook (idempotent, claimed atomically).
      await releaseHeld(db, ctx.org.id).catch((e: Error) => log.error("release_held_failed", { message: e.message }));
    }
  }
  const plan = effectivePlan(ent);
  const meters = Object.keys(plan.limits) as MeterId[];
  return json({ plan: { id: plan.id, name: plan.name }, entitlement: ent, usage: await currentUsage(db, ctx.org.id, meters), currency: product.currency });
});
