"use client";
import { useState } from "react";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/states";
import { CopyButton } from "@/components/app/copy-button";
import { fixForm, lintSnippet, type LintIssue } from "@/lib/onboarding/lint";

const SEV: Record<LintIssue["severity"], { tone: "danger" | "warning" | "info"; label: string }> = { error: { tone: "danger", label: "Fix" }, warning: { tone: "warning", label: "Suggested" }, info: { tone: "info", label: "Note" } };

function Linter({ endpoint }: { endpoint: string }) {
  const [code, setCode] = useState("");
  const [issues, setIssues] = useState<LintIssue[] | null>(null);
  const [fixed, setFixed] = useState<string | null>(null);
  const check = () => {
    const pasted = code.trim();
    setIssues(pasted ? lintSnippet(pasted, { endpoint }) : []);
    setFixed(pasted ? fixForm(pasted, endpoint) : null);
  };
  return (
    <Panel title="Check your form HTML" description="Paste the form you added to your site, or the one you use with Formspree, Web3Forms or FormSubmit. We check it, and give you a corrected copy that posts here. Nothing is stored.">
      <div className="flex flex-col gap-4">
        <Field label="Your form HTML" htmlFor="lint-code"><Textarea id="lint-code" value={code} onChange={(e) => setCode(e.target.value)} rows={8} spellCheck={false} className="font-mono text-xs" placeholder={`<form action="${endpoint}" method="POST">…</form>`} /></Field>
        <div><Button variant="secondary" onClick={check}>Check form</Button></div>
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
        {fixed ? (
          <div className="flex flex-col gap-2">
            <p className="title-4 text-text">Corrected form</p>
            <p className="caption-2 text-text-subtle">Your markup and field names as pasted, with this form&apos;s endpoint, method POST, a hidden honeypot, and other services&apos; key fields removed. Replace your form with it.</p>
            <pre aria-label="Corrected form" className="max-h-dvh overflow-auto rounded-md bg-code-bg p-4 font-mono text-xs leading-relaxed text-code-text"><code>{fixed}</code></pre>
            <div><CopyButton value={fixed} label="Copy corrected form" /></div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

import { TestSend } from "@/components/app/forms/test-send";

export function OnboardingClient({ formId, endpoint, canWrite, paused }: { formId: string; endpoint: string; canWrite: boolean; paused: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <Linter endpoint={endpoint} />
      <TestSend formId={formId} canWrite={canWrite} paused={paused} />
    </div>
  );
}
