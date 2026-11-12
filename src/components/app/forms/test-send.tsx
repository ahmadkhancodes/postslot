"use client";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/states";
import type { TestReceipt } from "@/lib/onboarding/test-submission";

const STEP_TONE: Record<string, "success" | "warning" | "danger"> = { done: "success", warn: "warning", bad: "danger", pending: "warning" };

export function TestSend({ formId, canWrite, paused }: { formId: string; canWrite: boolean; paused: boolean }) {
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
