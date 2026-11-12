import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { DataTable, Td } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { fmt } from "@/components/app/labels";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/states";
import { adminOverview } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { founderSearch, mailPipeline } from "@/lib/founder";
import { getFlags } from "@/lib/flags";

export const dynamic = "force-dynamic";

const when = (d: Date | null) => (d ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC" : "never");

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";
  const db = await getDb();
  const [totals, flags, pipe, found] = await Promise.all([adminOverview(), getFlags(), mailPipeline(db), q ? founderSearch(db, q) : null]);
  const stats = [
    { label: "Users", value: totals.users },
    { label: "Organizations", value: totals.orgs },
    { label: "Paid organizations", value: totals.paidOrgs },
  ];
  const pipeRows: [string, string, "success" | "warning" | "danger" | "info"][] = [
    ["Mail provider", pipe.provider, "info"],
    ["Provider webhook secret", pipe.webhooks.provider ? "set" : "missing", pipe.webhooks.provider ? "success" : "warning"],
    ["DSN webhook secret", pipe.webhooks.dsn ? "set" : "missing", pipe.webhooks.dsn ? "success" : "info"],
    ["SMTP server", pipe.smtpConfigured ? "configured" : "not configured", pipe.smtpConfigured ? "success" : "info"],
    ["Queued deliveries", `${fmt(pipe.queued)}${pipe.oldestQueuedAt ? `, oldest ${when(pipe.oldestQueuedAt)}` : ""}`, pipe.queued > 50 ? "warning" : "success"],
    ["Deferred now", fmt(pipe.deferred), pipe.deferred > 20 ? "warning" : "success"],
    ["Accepted, last 24 h", fmt(pipe.accepted24h), "success"],
    ["Returned, last 24 h", fmt(pipe.returned24h), pipe.returned24h > 0 ? "warning" : "success"],
    ["Gave up, last 24 h", fmt(pipe.failed24h), pipe.failed24h > 0 ? "danger" : "success"],
    ["Stuck in received (over 2 min)", fmt(pipe.stuckReceived), pipe.stuckReceived > 0 ? "danger" : "success"],
    ["Last inbound mail event", when(pipe.lastInboundEventAt), "info"],
  ];
  return (
    <>
      <PageHeader title="Admin overview" description="Totals across every organization. Visible to founder accounts only. Every change here is written to the audit log." />
      <div className="flex flex-col gap-10">
        <dl className="grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-6">
              <dt className="title-4 text-text-subtle">{s.label}</dt>
              <dd className="heading-4 tabular-nums text-text">{fmt(s.value)}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="search-h" className="flex flex-col gap-3">
          <h2 id="search-h" className="title-2 text-text">Search</h2>
          <form method="get" action="/admin" role="search" className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input name="q" defaultValue={q} placeholder="Workspace name or id, form id, key or name, submission id" aria-label="Search workspaces, forms and submissions" className="pl-10" />
            </div>
            <button type="submit" className={buttonClass("primary", "md")}>Search</button>
          </form>
          {found ? (
            found.workspaces.length || found.forms.length || found.submission ? (
              <div className="flex flex-col gap-4">
                {found.workspaces.length ? (
                  <DataTable caption="Workspaces" columns={[{ key: "n", label: "Workspace" }, { key: "id", label: "Id" }, { key: "a", label: "" }]}>
                    {found.workspaces.map((w) => (
                      <tr key={w.id}><Td>{w.name}</Td><Td><code>{w.id}</code></Td><Td><Link className="underline underline-offset-4" href={`/admin/org/${encodeURIComponent(w.id)}`} aria-label={`Open workspace ${w.name}`}>Open</Link></Td></tr>
                    ))}
                  </DataTable>
                ) : null}
                {found.forms.length ? (
                  <DataTable caption="Forms" columns={[{ key: "n", label: "Form" }, { key: "s", label: "Status" }, { key: "o", label: "Workspace" }]}>
                    {found.forms.map((f) => (
                      <tr key={f._id}><Td>{f.name} <code className="text-text-muted">{f._id}</code></Td><Td><Badge tone={f.status === "suspended" ? "danger" : f.status === "paused" ? "warning" : "success"}>{f.status}</Badge></Td><Td><Link className="underline underline-offset-4" href={`/admin/org/${encodeURIComponent(f.orgId)}`}>{f.orgId}</Link></Td></tr>
                    ))}
                  </DataTable>
                ) : null}
                {found.submission ? (
                  <DataTable caption="Submission metadata" columns={[{ key: "k", label: "Submission" }, { key: "s", label: "Status" }, { key: "sc", label: "Spam score" }, { key: "sg", label: "Signals" }, { key: "o", label: "Workspace" }]}>
                    <tr>
                      <Td><code>{found.submission.id}</code>{found.submission.isTest ? " (test)" : ""}</Td>
                      <Td>{found.submission.status}{found.submission.holdReason ? `, ${found.submission.holdReason}` : ""}</Td>
                      <Td>{found.submission.spamScore.toFixed(2)}</Td>
                      <Td>{found.submission.signals.join(", ") || "none"}</Td>
                      <Td><Link className="underline underline-offset-4" href={`/admin/org/${encodeURIComponent(found.submission.orgId)}`}>{found.submission.orgId}</Link></Td>
                    </tr>
                  </DataTable>
                ) : null}
                <p className="caption-2 text-text-subtle">Only metadata is shown. Message content stays private to the workspace.</p>
              </div>
            ) : <Notice>Nothing matches “{q}”.</Notice>
          ) : null}
        </section>

        <section aria-labelledby="pipe-h" className="flex flex-col gap-3">
          <h2 id="pipe-h" className="title-2 text-text">Mail pipeline</h2>
          <DataTable caption="Mail pipeline status" columns={[{ key: "k", label: "Check" }, { key: "v", label: "Status" }]}>
            {pipeRows.map(([k, v, tone]) => <tr key={k}><Td>{k}</Td><Td><Badge tone={tone}>{v}</Badge></Td></tr>)}
          </DataTable>
        </section>

        <section aria-labelledby="flags-h" className="flex flex-col gap-3">
          <h2 id="flags-h" className="title-2 text-text">Feature flags</h2>
          <DataTable caption="Feature flags" columns={[{ key: "flag", label: "Flag" }, { key: "value", label: "Value" }]}>
            {Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
              <tr key={k}>
                <Td><code>{k}</code></Td>
                <Td><Badge tone={v === "on" || v === "true" ? "success" : "info"}>{v}</Badge></Td>
              </tr>
            ))}
          </DataTable>
          <p className="caption-2 text-text-subtle">Flags come from product defaults, the config collection and the APP_FLAGS environment variable, in that order.</p>
        </section>
      </div>
    </>
  );
}
