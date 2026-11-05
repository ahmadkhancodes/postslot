import { DataTable, Td } from "@/components/app/data-table";
import { PageHeader, Panel } from "@/components/app/page-header";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/states";
import { getDb } from "@/lib/db";
import { ActionButton, SuppressionAdd } from "../admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin suppression list" };

export default async function SuppressionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 100) ?? "";
  const rows = await (await getDb()).listSuppressions({ q: q || undefined, limit: 100 });
  return (
    <>
      <PageHeader title="Suppression list" description="Addresses we never send to. Bounces and complaints add rows automatically, per workspace (scope org:<id>). Edits are written to the audit log." />
      <div className="flex flex-col gap-8">
        <form method="get" action="/admin/suppressions" role="search" className="flex flex-col gap-3 sm:flex-row">
          <Input name="q" defaultValue={q} placeholder="Part of an email address" aria-label="Search the suppression list" />
          <button type="submit" className={buttonClass("secondary", "md")}>Search</button>
        </form>
        <DataTable caption="Suppressed addresses" columns={[{ key: "e", label: "Address" }, { key: "s", label: "Scope" }, { key: "r", label: "Reason" }, { key: "a", label: "Action" }]}>
          {rows.length ? rows.map((r) => (
            <tr key={`${r.email}|${r.scope}`}>
              <Td>{r.email}</Td><Td><code>{r.scope}</code></Td><Td><Badge tone={r.reason === "complaint" ? "danger" : "info"}>{r.reason}</Badge></Td>
              <Td><ActionButton payload={{ type: "suppression.remove", email: r.email, scope: r.scope }} label="Remove" /></Td>
            </tr>
          )) : <tr><Td>No addresses{q ? ` match “${q}”` : ""}.</Td><Td /><Td /><Td /></tr>}
        </DataTable>
        <Panel title="Add an address"><SuppressionAdd /></Panel>
      </div>
    </>
  );
}
