"use client";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/states";
import { lintSnippet, type LintIssue } from "@/lib/onboarding/lint";
import type { TestReceipt } from "@/lib/onboarding/test-submission";

const SEV: Record<LintIssue["severity"], { tone: "danger" | "warning" | "info"; label: string }> = { error: { tone: "danger", label: "Fix" }, warning: { tone: "warning", label: "Suggested" }, info: { tone: "info", label: "Note" } };

function Linter({ endpoint }: { endpoint: string }) {
  const [code, setCode] = useState("");
  const [issues, setIssues] = useState<LintIssue[] | null>(null);
  return (
    <Panel title="Check your form HTML" description="Paste the form you added to your site. We check it before a visitor finds the problem. Nothing is stored.">
      <div className="flex flex-col gap-4">
        <Field label="Your form HTML" htmlFor="lint-code"><Textarea id="lint-code" value={code} onChange={(e) => setCode(e.target.value)} rows={8} spellCheck={false} className="font-mono text-xs" placeholder={`<form action="${endpoint}" method="POST">…</form>`} /></Field>
        <div><Button onClick={() => setIssues(code.trim() ? lintSnippet(code, { endpoint }) : [])}>Check form</Button></div>
        {issues ? (
          issues.length ? (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border" aria-label="Linter results">
              {issues.map((i, n) => (
                <li key={`${i.rule}${n}`} className="flex flex-col gap-1 p-3">
                  <span className="flex flex-wrap items-center gap-2"><Badge tone={SEV[i.severity].tone}>{SEV[i.severity].label}</Badge><span className="body-5 text-text">{i.message}</span></span>
                  <span className="caption-2 text-text-subtle">{i.fix}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Notice tone="success" title="This form looks right">The action, method, field names and honeypot are all in place.</Notice>
          )
        ) : null}
      </div>
    </Panel>
  );
}

const STEP_TONE: Record<string, "success" | "warning" | "danger"> = { done: "success", warn: "warning", bad: "danger", pending: "warning" };

function TestSend({ formId, canWrite, paused }: { formId: string; canWrite: boolean; paused: boolean }) {
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<TestReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setError(null);
    const r = await api<{ receipt: TestReceipt }>(`/api/forms/${formId}/test`, { method: "POST", body: {} });
    setBusy(false);
    if (r.ok) setReceipt(r.data.receipt);
    else setError(r.code === "form_paused" ? "This form is paused. Unpause it in the settings first." : r.message);
  }
  return (
    <Panel title="Send a test submission" description="Sends a labelled test through the real pipeline to your confirmed recipients. It is marked [Test] and does not count toward your monthly submissions.">
      <div className="flex flex-col gap-4">
        <div><Button onClick={send} loading={busy} disabled={!canWrite || paused}>Send test submission</Button></div>
        {paused ? <p className="caption-2 text-text-subtle">The form is paused, so tests are off.</p> : null}
        {error ? <p role="alert" className="caption-2 text-danger">{error}</p> : null}
        {receipt ? (
          <div role="status" aria-label="Test receipt" className="flex flex-col gap-3 rounded-md border border-border p-4">
            <p className="title-4 text-text">Receipt</p>
            <ol className="flex flex-col gap-2">
              {receipt.steps.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2"><Badge tone={STEP_TONE[s.tone] ?? "info"}>{s.label}</Badge><span className="caption-2 text-text-subtle">{s.detail ?? ""}</span></li>
              ))}
            </ol>
            {receipt.status === "held" ? <p className="caption-2 text-text-subtle">The test is held because no recipient is confirmed yet. Confirm one under Install and settings.</p> : null}
            <p className="caption-2 text-text-subtle">{receipt.deliveries.length ? `Sent to ${receipt.deliveries.map((d) => d.email).join(", ")}. Check the inbox for the [Test] email; delivery status can still change.` : "No email was sent."}</p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function OnboardingClient({ formId, endpoint, canWrite, paused }: { formId: string; endpoint: string; canWrite: boolean; paused: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <Linter endpoint={endpoint} />
      <TestSend formId={formId} canWrite={canWrite} paused={paused} />
    </div>
  );
}
