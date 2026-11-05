import type { PlanId } from "@/config/product";

/** History kept per plan (docs/ARCHITECTURE.md section 2). Drives `purgeAt` (Mongo TTL). */
const DAYS: Record<PlanId, number> = { free: 90, starter: 180, pro: 365, agency: 365 };

export const retentionDays = (plan: PlanId) => DAYS[plan];
export const purgeAtFor = (plan: PlanId, receivedAt: Date) => new Date(receivedAt.getTime() + DAYS[plan] * 864e5);
