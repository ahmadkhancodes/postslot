import { PageHeader } from "@/components/app/page-header";
import { Notice } from "@/components/ui/states";
import { planById, product } from "@/config/product";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { effectivePlan, planRank } from "@/lib/billing/entitlement";
import { getDb } from "@/lib/db";
import { getFlags } from "@/lib/flags";
import { expectedRecords, type SenderDomain } from "@/lib/domains";
import { DomainsClient } from "./domains-client";

export const metadata = { title: "Sending domain" };
export const dynamic = "force-dynamic";

export default async function DomainsPage() {
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const [rows, ent, flags] = await Promise.all([
    db.docs<SenderDomain>("sender_domains").find({ orgId: ctx.org.id }, { sort: { createdAt: 1 } }),
    db.getEntitlement(ctx.org.id),
    getFlags(),
  ]);
  const allowed = planRank(effectivePlan(ent).id) >= planRank(product.sending.minPlan);
  const domains = rows.map((d) => ({
    domain: d.domain, verified: !!d.verified, checkedAt: d.checkedAt?.toISOString() ?? null, results: d.results ?? [], records: expectedRecords(d.domain),
  }));
  return (
    <>
      <PageHeader title="Sending domain" description="Send notification emails from your own domain by publishing three DNS records. Check them here once they are live." />
      <div className="flex flex-col gap-6">
        {flags.own_mta_live === "on" ? null : (
          <Notice tone="info" title="Depends on the own mail server path">
            Sending from your domain needs our SMTP path, which is not switched on yet. You can add your domain, publish the records and check them now, so it is ready the day it goes live. Until then notifications keep coming from {product.name}&apos;s shared address.
          </Notice>
        )}
        {!allowed ? (
          <Notice tone="warning" title={`A custom sending domain is part of ${planById(product.sending.minPlan)?.name ?? "Pro"}`}>
            Your plan can read this page but not add a domain. Upgrade under Billing to add one.
          </Notice>
        ) : null}
        <DomainsClient canManage={can(ctx.role, "data", "write") && allowed} initial={domains} />
      </div>
    </>
  );
}
