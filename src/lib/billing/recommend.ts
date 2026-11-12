import { product, type MeterId, type Plan, type PlanId } from "@/config/product";

/**
 * The smallest paid plan above the current one that covers what this workspace needs right now (this month's counted
 * submissions plus the ones held over the limit, and any other meter it asks for). Null when nothing needs more room or
 * no plan is big enough. `overLimit` says the workspace's own limit (which an admin override can lower) is already
 * passed, so the current plan does not count as fitting even when its list limit would.
 */
export function planThatFits(current: PlanId, need: Partial<Record<MeterId, number>>, overLimit = false): Plan | null {
  const plans = product.plans as readonly Plan[];
  const at = plans.findIndex((p) => p.id === current);
  const cur = plans[at];
  if (!cur) return null;
  const tooSmall = (p: Plan) => Object.entries(need).some(([m, n]) => (n ?? 0) > p.limits[m as MeterId]);
  if (!overLimit && !tooSmall(cur)) return null;
  return plans.slice(at + 1).find((p) => p.prices.length > 0 && !tooSmall(p)) ?? null;
}
