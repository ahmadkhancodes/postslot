import { can } from "@/lib/auth/roles";

/** Sections of `Db.exportOrgData` and the permission each needs; anything not listed needs data:read. */
const GATED: Record<string, [resource: "audit" | "billing" | "webhook", action: string]> = {
  auditLog: ["audit", "read"],
  billingAccount: ["billing", "read"],
  entitlement: ["billing", "read"],
  webhookEndpoints: ["webhook", "read"],
};

/**
 * Cuts one workspace's export to what the caller's role may read in the app (docs/SECURITY-REVIEW.md S-2).
 * Without it a viewer read the audit log, the billing account and webhook endpoints through the account export.
 */
export function scopeOrgExport(data: Record<string, unknown>, role: string | null | undefined): Record<string, unknown> {
  const r = role?.split(",")[0];
  return Object.fromEntries(Object.entries(data).filter(([k]) => {
    const gate = GATED[k];
    return gate ? can(r, gate[0], gate[1]) : can(r, "data", "read");
  }));
}
