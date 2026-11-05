import type { Db } from "@/lib/db/types";
import { limitFor } from "./entitlement";

/** Members a workspace may have on its current plan (`seats` in product.ts). Better Auth checks it when an invite is accepted or a member is added. */
export async function seatLimit(db: Db, orgId: string, now = Date.now()): Promise<number> {
  return Math.max(1, limitFor(await db.getEntitlement(orgId), "seats", now));
}
