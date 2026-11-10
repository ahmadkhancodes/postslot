"use client";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/app/api";
import { formatDate } from "@/lib/format";
import { CopyButton } from "@/components/app/copy-button";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/states";
import type { ExpectedRecord, RecordCheck } from "@/lib/domains";

interface Row { domain: string; verified: boolean; checkedAt: string | null; results: RecordCheck[]; records: ExpectedRecord[] }

const ERRORS: Record<string, string> = {
  invalid_domain: "Enter a domain like example.com, without https://.",
  domain_exists: "That domain is already on this workspace.",
  domain_limit: "You have reached the limit of 5 domains.",
  plan_required: "A custom sending domain is part of Pro. Upgrade under Billing.",
};

export function DomainsClient({ canManage, initial }: { canManage: boolean; initial: Row[] }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add"); setError(null);
    const r = await api("/api/domains", { body: { domain } });
    setBusy(null);
    if (r.ok) { setDomain(""); router.refresh(); } else setError(ERRORS[r.code] ?? r.message);
  }
  async function check(d: string) {
    setBusy(d); setError(null);
    const r = await api(`/api/domains/${encodeURIComponent(d)}/check`, { method: "POST", body: {} });
    setBusy(null);
    if (r.ok) router.refresh(); else setError(r.code === "rate_limited" ? "Too many checks. Wait a minute." : r.message);
  }
  async function remove(d: string) {
    setBusy(d); setError(null);
    const r = await api(`/api/domains/${encodeURIComponent(d)}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) router.refresh(); else setError(r.message);
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <form onSubmit={add} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Add a domain" htmlFor="domain" error={error} hint="The domain in your From address, for example example.com.">
              <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" required maxLength={260} aria-invalid={!!error} />
            </Field>
          </div>
          <Button type="submit" loading={busy === "add"}>Add domain</Button>
        </form>
      ) : error ? <p role="alert" className="caption-2 text-danger">{error}</p> : null}

      {initial.length === 0 ? (
        <EmptyState title="No sending domain yet" body="Add the domain you want notification emails to come from. We show the three DNS records to publish." />
      ) : initial.map((d) => (
        <section key={d.domain} aria-labelledby={`d-${d.domain}`} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id={`d-${d.domain}`} className="title-2 text-text">{d.domain}</h2>
              <p className="caption-2 text-text-subtle">{d.checkedAt ? `Last checked ${formatDate(d.checkedAt, true)}` : "Not checked yet"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={d.verified ? "success" : "warning"}>{d.verified ? "All records found" : "Records missing"}</Badge>
              {canManage ? <Button variant="primary" loading={busy === d.domain} onClick={() => check(d.domain)}>Check records</Button> : null}
              {canManage ? <Button variant="tertiary" disabled={busy === d.domain} onClick={() => remove(d.domain)}>Remove</Button> : null}
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {d.records.map((r) => {
              const res = d.results.find((x) => x.id === r.id);
              return (
                <li key={r.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="title-4 text-text">{r.label}</h3>
                    <span className="caption-3 text-text-subtle">{r.type} record</span>
                    {res ? (
                      <span className={`inline-flex items-center gap-1 caption-3 ${res.status === "pass" ? "text-success" : "text-danger"}`}>
                        {res.status === "pass" ? <CheckCircle size={16} weight="fill" aria-hidden /> : <XCircle size={16} weight="fill" aria-hidden />}
                        {res.status === "pass" ? "Pass" : "Fail"}
                      </span>
                    ) : null}
                  </div>
                  <p className="body-6 text-text-subtle">{r.purpose}</p>
                  <dl className="grid gap-2 sm:grid-cols-[6rem_1fr_auto] sm:items-center">
                    <dt className="caption-3 text-text-subtle">Host</dt>
                    <dd className="min-w-0 break-all font-mono text-sm text-text">{r.host}</dd>
                    <dd><CopyButton value={r.host} label="Copy host" /></dd>
                    <dt className="caption-3 text-text-subtle">Value</dt>
                    <dd className="min-w-0 break-all font-mono text-sm text-text">{r.value}</dd>
                    <dd><CopyButton value={r.value} label="Copy value" /></dd>
                  </dl>
                  {res ? <p className="caption-2 text-text-subtle" role="status">{res.detail}{res.found.length ? ` Found: ${res.found.join(" | ")}` : ""}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
