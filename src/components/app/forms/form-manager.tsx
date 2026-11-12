"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/app/api";
import { CopyButton } from "@/components/app/copy-button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Panel } from "@/components/app/page-header";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/states";
import type { Snippet } from "@/lib/onboarding/snippets";

interface RecipientView { id: string; email: string; verified: boolean; bounced: string | null }
interface FormView { id: string; name: string; status: string; redirectUrl: string; allowedOrigins: string[]; altchaEnabled: boolean; spamMode: string; blockedCount: number; subjectTemplate: string }

function SnippetPicker({ endpoint, snippets }: { endpoint: string; snippets: Snippet[] }) {
  const [id, setId] = useState(snippets[0]!.id);
  const s = snippets.find((x) => x.id === id) ?? snippets[0]!;
  return (
    <Panel title="Install" description="Pick your stack and paste. The form works without JavaScript; visitors land on your success URL or a thank-you page.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="title-4 text-text">Endpoint URL</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface-raised px-3 py-2 caption-2 text-text">{endpoint}</code>
            <CopyButton value={endpoint} label="Copy URL" />
          </div>
        </div>
        <div role="tablist" aria-label="Stack" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {snippets.map((x) => (
            <button
              key={x.id}
              role="tab"
              type="button"
              aria-selected={x.id === id}
              onClick={() => setId(x.id)}
              className={cn("min-h-11 whitespace-nowrap rounded-md px-3 body-5 transition-colors duration-300 focus-visible:focus-ring", x.id === id ? "bg-surface-sunken text-text" : "text-text-subtle hover:bg-surface-raised hover:text-text")}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="flex flex-col gap-2">
          <pre className="max-h-96 overflow-auto rounded-md bg-code-bg p-4 font-mono text-xs leading-relaxed text-code-text"><code>{s.code}</code></pre>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="caption-2 text-text-subtle">{s.note ?? "Field names are up to you. email becomes the Reply-To address."}</p>
            <CopyButton value={s.code} label="Copy snippet" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Recipients({ formId, recipients, canWrite }: { formId: string; recipients: RecipientView[]; canWrite: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  async function call(key: string, path: string, init: { method?: string; body?: unknown }, ok: string) {
    setBusy(key);
    setNote(null);
    const r = await api(path, init);
    setBusy(null);
    if (r.ok) { setNote({ tone: "ok", text: ok }); router.refresh(); }
    else setNote({ tone: "err", text: r.code === "plan_required" ? "Your plan's recipient limit is reached. Remove one or upgrade." : r.message });
    return r.ok;
  }
  return (
    <Panel title="Recipients" description="Each address gets a confirmation link first. No submission content is sent to an address until it is confirmed.">
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {recipients.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="break-all body-5 text-text">{r.email}</span>
                {r.bounced ? <span className="caption-2 text-danger">We couldn&apos;t deliver here: {r.bounced}</span> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.bounced ? "danger" : r.verified ? "success" : "warning"}>{r.bounced ? "Bounced" : r.verified ? "Confirmed" : "Waiting for confirmation"}</Badge>
                {canWrite && !r.verified ? <Button size="sm" variant="secondary" loading={busy === `s${r.id}`} onClick={() => call(`s${r.id}`, `/api/forms/${formId}/recipients/${encodeURIComponent(r.id)}`, { body: { action: "resend" } }, "Confirmation email sent.")}>Resend link</Button> : null}
                {canWrite && r.bounced ? <Button size="sm" variant="secondary" loading={busy === `u${r.id}`} onClick={() => call(`u${r.id}`, `/api/forms/${formId}/recipients/${encodeURIComponent(r.id)}`, { body: { action: "unsuppress" } }, "Address released. Press Redeliver on a submission to send it again.")}>Allow again</Button> : null}
                {canWrite ? <Button size="sm" variant="tertiary" loading={busy === `d${r.id}`} onClick={() => call(`d${r.id}`, `/api/forms/${formId}/recipients/${encodeURIComponent(r.id)}`, { method: "DELETE" }, "Recipient removed from this form.")}>Remove</Button> : null}
              </div>
            </li>
          ))}
          {!recipients.length ? <li className="p-3 body-6 text-text-subtle">No recipients. Submissions are held until you add and confirm one.</li> : null}
        </ul>
        {canWrite ? (
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={async (e) => { e.preventDefault(); if (await call("add", `/api/forms/${formId}/recipients`, { body: { email } }, "Added. We emailed a confirmation link.")) setEmail(""); }}>
            <div className="flex-1"><Field label="Add a recipient" htmlFor="rcpt-email"><Input id="rcpt-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@studio.com" required /></Field></div>
            <Button type="submit" loading={busy === "add"}>Add and confirm</Button>
          </form>
        ) : null}
        {note ? <p role={note.tone === "err" ? "alert" : "status"} className={`caption-2 ${note.tone === "err" ? "text-danger" : "text-text-subtle"}`}>{note.text}</p> : null}
      </div>
    </Panel>
  );
}

function Settings({ form, canWrite, origin }: { form: FormView; canWrite: boolean; origin: string }) {
  const router = useRouter();
  const [v, setV] = useState({ name: form.name, redirectUrl: form.redirectUrl, origins: form.allowedOrigins.join("\n"), altcha: form.altchaEnabled, spam: form.spamMode, paused: form.status === "paused", subject: form.subjectTemplate });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  return (
    <Panel title="Settings" description="Where visitors land, which sites may post, and how spam is handled.">
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          const r = await api(`/api/forms/${form.id}`, {
            method: "PATCH",
            body: {
              name: v.name, redirectUrl: v.redirectUrl.trim(), subjectTemplate: v.subject, altchaEnabled: v.altcha, spamMode: v.spam,
              status: v.paused ? "paused" : "active", allowedOrigins: v.origins.split(/\s+/).map((x) => x.trim()).filter(Boolean),
            },
          });
          setBusy(false);
          if (r.ok) { setMsg({ tone: "ok", text: "Saved." }); router.refresh(); }
          else setMsg({ tone: "err", text: r.code === "invalid_input" ? "Check the success URL: it must start with https://." : r.message });
        }}
      >
        <fieldset disabled={!canWrite} className="flex flex-col gap-5">
          <Field label="Form name" htmlFor="f-name"><Input id="f-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} required /></Field>
          <Field label="Success URL" htmlFor="f-redirect" hint="Visitors who post an HTML form land here. Leave empty for the default thank-you page."><Input id="f-redirect" type="url" value={v.redirectUrl} onChange={(e) => setV({ ...v, redirectUrl: e.target.value })} placeholder="https://yoursite.com/thanks" /></Field>
          <Field label="Email subject" htmlFor="f-subject" hint="Use {{field}} to insert a field, for example New message from {{name}}."><Input id="f-subject" value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} maxLength={200} /></Field>
          <Field label="Allowed sites" htmlFor="f-origins" hint={<>One per line, for example <code>yoursite.com</code> or <code>*.yoursite.com</code>. Empty allows any site. {form.blockedCount ? `${form.blockedCount} posts blocked so far.` : ""}</>}><Textarea id="f-origins" value={v.origins} onChange={(e) => setV({ ...v, origins: e.target.value })} rows={3} /></Field>
          <Field label="Spam filtering" htmlFor="f-spam" hint="Strict quarantines on weaker signals. Off still applies the honeypot and rate limits."><Select id="f-spam" value={v.spam} onChange={(e) => setV({ ...v, spam: e.target.value })}><option value="standard">Standard</option><option value="strict">Strict</option><option value="off">Off</option></Select></Field>
          <label className="flex min-h-11 items-start gap-3 body-6 text-text"><input type="checkbox" checked={v.altcha} onChange={(e) => setV({ ...v, altcha: e.target.checked })} className="mt-1 size-5 accent-[var(--action)]" /><span>Require the ALTCHA proof-of-work check<span className="block caption-2 text-text-subtle">Turn this on only after adding the ALTCHA widget to your form with challengeurl set to {`${origin}/api/altcha`}. Without the widget every submission is rejected.</span></span></label>
          <label className="flex min-h-11 items-start gap-3 body-6 text-text"><input type="checkbox" checked={v.paused} onChange={(e) => setV({ ...v, paused: e.target.checked })} className="mt-1 size-5 accent-[var(--action)]" /><span>Pause this form<span className="block caption-2 text-text-subtle">Posts get a clear 403 instead of being stored.</span></span></label>
        </fieldset>
        {canWrite ? <div className="flex items-center gap-3"><Button type="submit" loading={busy}>Save settings</Button>{msg ? <p role={msg.tone === "err" ? "alert" : "status"} className={`caption-2 ${msg.tone === "err" ? "text-danger" : "text-text-subtle"}`}>{msg.text}</p> : null}</div> : null}
      </form>
    </Panel>
  );
}

function DangerZone({ formId, canWrite }: { formId: string; canWrite: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  if (!canWrite) return null;
  return (
    <Panel title="Delete all submissions" description="Permanently removes every stored submission of this form, spam and held ones included, with their delivery receipts. The form, its recipients and your monthly count stay.">
      <div className="flex flex-col gap-3">
        <div><Button variant="danger" onClick={() => { setError(null); setOpen(true); }}>Delete all submissions</Button></div>
        {done !== null ? <p role="status" className="caption-2 text-text-subtle">Deleted {done} submission{done === 1 ? "" : "s"}.</p> : null}
      </div>
      <ConfirmDialog
        open={open} title="Delete all submissions?" confirmLabel="Delete everything" typeToConfirm="delete" busy={busy} error={error}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const r = await api<{ deleted: number }>(`/api/forms/${formId}/submissions`, { method: "DELETE" });
          setBusy(false);
          if (!r.ok) return setError(r.message);
          setDone(r.data.deleted);
          setOpen(false);
          router.refresh();
        }}
      >
        This cannot be undone.
      </ConfirmDialog>
    </Panel>
  );
}

export function FormManager({ form, endpoint, recipients, snippets, canWrite }: { form: FormView; endpoint: string; recipients: RecipientView[]; snippets: Snippet[]; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <SnippetPicker endpoint={endpoint} snippets={snippets} />
      <Recipients formId={form.id} recipients={recipients} canWrite={canWrite} />
      <Settings form={form} canWrite={canWrite} origin={new URL(endpoint).origin} />
      <DangerZone formId={form.id} canWrite={canWrite} />
    </div>
  );
}
