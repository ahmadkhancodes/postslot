"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { TEMPLATES, type TemplateId } from "@/lib/forms/types";

interface Preview { subject: string; text: string; html: string }

export function TemplatesClient({ formId, canWrite, initial }: { formId: string; canWrite: boolean; initial: { template: TemplateId; subject: string } }) {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateId>(initial.template);
  const [subject, setSubject] = useState(initial.subject);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // The preview is rendered by the server with the same function that renders the real email.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await api<Preview>(`/api/forms/${formId}/preview?template=${template}&subject=${encodeURIComponent(subject)}`);
      if (live && r.ok) setPreview(r.data);
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [formId, template, subject]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/forms/${formId}`, { method: "PATCH", body: { template, subjectTemplate: subject } });
    setBusy(false);
    if (r.ok) { setMsg({ tone: "ok", text: "Saved. New submissions use this template." }); router.refresh(); }
    else setMsg({ tone: "err", text: r.message });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Panel title="Template" description="Pick the layout and the subject line. The preview on the right is what lands in your inbox.">
        <form className="flex flex-col gap-5" onSubmit={save}>
          <fieldset disabled={!canWrite} className="flex flex-col gap-5">
            <div role="radiogroup" aria-label="Layout" className="flex flex-col gap-2">
              {TEMPLATES.map((t) => (
                <label key={t.id} className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-300 focus-within:focus-ring", template === t.id ? "border-action bg-surface-raised" : "border-border hover:bg-surface-raised")}>
                  <input type="radio" name="template" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} className="mt-1 size-4 accent-[var(--action)]" />
                  <span><span className="block body-5 text-text">{t.label}</span><span className="block caption-2 text-text-subtle">{t.hint}</span></span>
                </label>
              ))}
            </div>
            <Field label="Email subject" htmlFor="t-subject" hint={<>Insert a field with <code>{"{{name}}"}</code>, or the form name with <code>{"{{form}}"}</code>. A missing field renders empty.</>}>
              <Input id="t-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </Field>
          </fieldset>
          {canWrite ? <div className="flex items-center gap-3"><Button type="submit" loading={busy}>Save template</Button>{msg ? <p role={msg.tone === "err" ? "alert" : "status"} className={`caption-2 ${msg.tone === "err" ? "text-danger" : "text-text-subtle"}`}>{msg.text}</p> : null}</div> : null}
        </form>
      </Panel>
      <Panel title="Preview" description="Sample data: the same renderer sends the real email.">
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="body-6 text-text"><span className="text-text-subtle">Subject: </span><span data-testid="preview-subject">{preview?.subject ?? "…"}</span></p>
          {preview ? (
            preview.html ? (
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[26rem] w-full rounded-md border border-border bg-white" />
            ) : (
              <pre data-testid="preview-text" className="max-h-[26rem] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-raised p-4 font-mono text-xs text-text">{preview.text}</pre>
            )
          ) : (
            <div className="h-[26rem] rounded-md bg-surface-sunken motion-safe:animate-pulse" aria-hidden />
          )}
          {preview?.html ? <details className="caption-2 text-text-subtle"><summary className="min-h-11 cursor-pointer py-2">Plain text part (sent with every HTML email)</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono text-xs">{preview.text}</pre></details> : null}
        </div>
      </Panel>
    </div>
  );
}
