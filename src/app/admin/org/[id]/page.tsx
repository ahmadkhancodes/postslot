import Link from "next/link";
import { DataTable, Td } from "@/components/app/data-table";
import { PageHeader, Panel } from "@/components/app/page-header";
import { fmt, METER_LABELS } from "@/components/app/labels";
import { Badge, Notice } from "@/components/ui/states";
import { plans } from "@/config/product";
import { effectivePlan } from "@/lib/billing/entitlement";
import { getDb } from "@/lib/db";
import { METERS, workspaceSummary } from "@/lib/founder";
import { ActionButton, LimitForm, PlanForm } from "../../admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin workspace" };

const when = (d: Date) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";

export default async function AdminOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const db = await getDb();
  const w = await workspaceSummary(db, id);
  const plan = effectivePlan(w.entitlement);
  const overrides = Object.entries(w.entitlement?.limitOverrides ?? {});
  return (
    <>
      <PageHeader
        title={w.org?.name ?? "Workspace"}
        description={<><Link href="/admin" className="underline underline-offset-4">Admin</Link> · <code>{id}</code> · plan {plan.name}{w.entitlement?.status ? ` (${w.entitlement.status})` : ""}</>}
      />
      <div className="flex flex-col gap-8">
        {w.suspended ? <Notice tone="danger" title="Workspace suspended">All forms are suspended and new forms are blocked. {w.suspended.reason ?? ""}</Notice> : null}

        <Panel title="Abuse signals" description="Computed from this month's counters, 30 days of deliveries and field names in the last 50 submissions.">
          {w.signals.length ? (
            <ul className="flex flex-col gap-3">
              {w.signals.map((s) => (
                <li key={s.id} className="flex flex-col gap-1"><span><Badge tone={s.severity === "high" ? "danger" : "warning"}>{s.label}</Badge></span><span className="body-6 text-text-subtle">{s.detail}</span></li>
              ))}
            </ul>
          ) : <p className="body-6 text-text-subtle">No signals.</p>}
          <dl className="mt-6 grid gap-4 sm:grid-cols-4">
            {[["Submissions", w.usage.submissions], ["Spam blocked", w.usage.spam], ["Held", w.usage.held], ["Spam rate", `${(w.spamRate * 100).toFixed(1)}%`]].map(([k, v]) => (
              <div key={String(k)}><dt className="caption-3 text-text-subtle">{k} ({w.usage.period})</dt><dd className="heading-6 tabular-nums text-text">{typeof v === "number" ? fmt(v) : v}</dd></div>
            ))}
          </dl>
        </Panel>

        <Panel title="Forms" description="Suspending a form stops it accepting posts at once.">
          {w.forms.length ? (
            <DataTable caption="Forms" columns={[{ key: "n", label: "Form" }, { key: "s", label: "Status" }, { key: "b", label: "Blocked posts", align: "right" }, { key: "a", label: "Action" }]}>
              {w.forms.map((f) => (
                <tr key={f._id}>
                  <Td>{f.name}<br /><code className="text-text-muted">{f._id}</code></Td>
                  <Td><Badge tone={f.status === "suspended" ? "danger" : f.status === "paused" ? "warning" : "success"}>{f.status}</Badge></Td>
                  <Td align="right">{fmt(f.blockedCount)}</Td>
                  <Td>{f.status === "suspended"
                    ? <ActionButton payload={{ type: "form.unsuspend", formId: f._id }} label="Unsuspend" />
                    : <ActionButton payload={{ type: "form.suspend", formId: f._id }} label="Suspend" variant="danger" askReason />}</Td>
                </tr>
              ))}
            </DataTable>
          ) : <p className="body-6 text-text-subtle">No forms.</p>}
        </Panel>

        <Panel title="Workspace" description="Suspend every form in the workspace and block new ones.">
          {w.suspended
            ? <ActionButton payload={{ type: "org.unsuspend", orgId: id }} label="Unsuspend workspace" />
            : <ActionButton payload={{ type: "org.suspend", orgId: id }} label="Suspend workspace" variant="danger" askReason />}
        </Panel>

        <div className="grid gap-8 lg:grid-cols-2">
          <Panel title="Plan"><PlanForm orgId={id} current={plan.id} plans={plans.map((p) => ({ id: p.id, name: p.name }))} /></Panel>
          <Panel title="Limits" description={overrides.length ? `Overrides: ${overrides.map(([k, v]) => `${k} ${fmt(v as number)}`).join(", ")}` : "No overrides. Plan limits apply."}>
            <LimitForm orgId={id} meters={METERS.map((m) => ({ id: m, label: METER_LABELS[m].plural }))} />
          </Panel>
        </div>

        <Panel title="Audit log" description="Latest entries for this workspace, including admin actions.">
          {w.audit.length ? (
            <DataTable caption="Audit entries" columns={[{ key: "a", label: "Action" }, { key: "t", label: "Target" }, { key: "b", label: "By" }, { key: "w", label: "When" }]}>
              {w.audit.map((a) => <tr key={a.id}><Td><code>{a.action}</code></Td><Td>{a.target ?? ""}</Td><Td>{a.by ?? ""}</Td><Td>{when(a.at)}</Td></tr>)}
            </DataTable>
          ) : <p className="body-6 text-text-subtle">No entries.</p>}
        </Panel>
      </div>
    </>
  );
}
