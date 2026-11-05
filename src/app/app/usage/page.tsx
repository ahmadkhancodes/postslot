import { DataTable, Td } from "@/components/app/data-table";
import { fmt } from "@/components/app/labels";
import { Meter } from "@/components/app/meter";
import { PageHeader, Panel } from "@/components/app/page-header";
import { UsageChart } from "@/components/app/usage-chart";
import { Notice } from "@/components/ui/states";
import { requireOrg } from "@/lib/auth/session";
import { usageState } from "@/lib/billing/usage";
import { getDb } from "@/lib/db";
import { usageReport } from "@/lib/usage/report";

export const metadata = { title: "Usage" };
export const dynamic = "force-dynamic";

const monthName = (p: string) => new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${p}-01T00:00:00Z`));

export default async function UsagePage() {
  const ctx = await requireOrg({ page: true });
  const report = await usageReport(await getDb(), ctx.org.id);
  const c = report.current;
  const tiles = [
    { label: "Spam blocked", value: c.spam, hint: "Never counts toward your limit" },
    { label: "Held over the limit", value: c.held, hint: "Released when you upgrade or the month resets" },
    { label: "Delivered", value: c.accepted, hint: "Accepted by the recipient's mail server" },
    { label: "Returned", value: c.returned, hint: "Bounced, blocked or complaints" },
  ];
  return (
    <>
      <PageHeader title="Usage" description="Submissions per month against your plan, what we held, what spam we blocked and how deliveries ended. Months are UTC calendar months." />
      <div className="flex flex-col gap-8">
        <div className="max-w-md"><Meter state={usageState("submissions", c.submissions, report.limit)} /></div>
        {c.held > 0 ? <Notice tone="warning" title={`${fmt(c.held)} held this month`}>These submissions are safe. They are released when you upgrade or the month resets, and nothing is dropped.</Notice> : null}
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-6">
              <dt className="title-4 text-text-subtle">{t.label}</dt>
              <dd className="heading-4 tabular-nums text-text">{fmt(t.value)}</dd>
              <dd className="caption-2 text-text-subtle">{t.hint}</dd>
            </div>
          ))}
        </dl>
        <Panel title="Last 12 months" description="Counted submissions plus held ones, against your current plan limit.">
          <UsageChart months={report.months} limit={report.limit} />
        </Panel>
        <DataTable
          caption="Monthly usage"
          columns={[
            { key: "m", label: "Month" }, { key: "s", label: "Counted", align: "right" }, { key: "h", label: "Held", align: "right" }, { key: "sp", label: "Spam blocked", align: "right" },
            { key: "a", label: "Delivered", align: "right" }, { key: "r", label: "Returned", align: "right" }, { key: "p", label: "In transit", align: "right" },
          ]}
        >
          {[...report.months].reverse().map((m) => (
            <tr key={m.period}>
              <Td>{monthName(m.period)}</Td><Td align="right">{fmt(m.submissions)}</Td><Td align="right">{fmt(m.held)}</Td><Td align="right">{fmt(m.spam)}</Td>
              <Td align="right">{fmt(m.accepted)}</Td><Td align="right">{fmt(m.returned)}</Td><Td align="right">{fmt(m.pending)}</Td>
            </tr>
          ))}
        </DataTable>
      </div>
    </>
  );
}
