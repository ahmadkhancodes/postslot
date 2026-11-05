import { freePlan, planById, type PlanId } from "@/config/product";

/** History kept per plan, read from `product.ts` (docs/ARCHITECTURE.md section 2). Drives `purgeAt` and the retention purge. */
export const retentionDays = (plan: PlanId) => (planById(plan) ?? freePlan).retentionDays;
export const purgeAtFor = (plan: PlanId, receivedAt: Date) => new Date(receivedAt.getTime() + retentionDays(plan) * 864e5);
