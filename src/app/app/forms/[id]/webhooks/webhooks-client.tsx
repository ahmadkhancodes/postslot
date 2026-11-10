"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useAsync } from "@/components/app/api";
import { formatDate } from "@/lib/format";
import { SecretReveal } from "@/components/app/copy-button";
import { Panel } from "@/components/app/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/states";

interface Endpoint { id: string; url: string; events: string[]; enabled: boolean; createdAt: string }
interface Delivery { id: string; endpointId: string; event: string; status: string; attempts: number; lastStatusCode: number | null; lastError: string | null; createdAt: string }
const TONE: Record<string, "info" | "success" | "warning" | "danger"> = { succeeded: "success", failed: "danger", retrying: "warning", pending: "info" };

export function FormWebhooksClient({ formId, canManage, allowed, events, initial }: { formId: string; canManage: boolean; allowed: boolean; events: string[]; initial: Endpoint[] }) {
  const [eps, setEps] = useState(initial);
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>(events);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ids = eps.map((e) => e.id).join(",");
  const log = useAsync(async () => {
    const all = await Promise.all(eps.map(async (e) => {
      const r = await api<{ deliveries: Delivery[] }>(`/api/webhooks/deliveries?endpointId=${encodeURIComponent(e.id)}`);
      return r.ok ? r.data.deliveries : [];
    }));
    return all.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
  }, [ids]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy("create");
    const r = await api<{ endpoint: Endpoint; secret: string }>(`/api/forms/${formId}/webhooks`, { body: { url: url.trim(), events: picked } });
    setBusy(null);
    if (!r.ok) return setErr(r.code === "plan_required" ? "Your plan has no webhook endpoint left. Starter includes 1, Pro 5, Agency 10." : r.code === "unsafe_url" ? "Use a public https:// URL." : r.message);
    setEps([...eps, r.data.endpoint]);
    setSecret(r.data.secret);
    setUrl("");
  }
  async function act(key: string, fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) {
    setBusy(key);
    setNote(null);
    const r = await fn();
    setBusy(null);
    setNote(r.ok ? ok : (r.message ?? "That did not work."));
    log.reload();
  }

  if (!allowed) {
    return (
      <Notice tone="info" title="Webhooks are on Starter and above" action={<ButtonLink href="/app/billing" variant="secondary">See plans</ButtonLink>}>
        Upgrade to get signed submission events (received, delivered, bounced, held) sent to your own server.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Endpoints" description="We POST signed JSON (HMAC-SHA256 in the X-Webhook-Signature header). Failed deliveries retry with backoff for about a day.">
        <div className="flex flex-col gap-4">
          {secret ? <SecretReveal title="Signing secret" value={secret} onDismiss={() => setSecret(null)} /> : null}
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {eps.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1"><span className="break-all body-5 text-text">{e.url}</span><span className="caption-2 text-text-subtle">{e.events.join(", ")}</span></div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" loading={busy === `t${e.id}`} onClick={() => act(`t${e.id}`, async () => { const r = await api(`/api/webhooks/${e.id}/test`, { method: "POST", body: {} }); return r; }, "Test event sent. See the log below.")}>Send test event</Button>
                    <Button size="sm" variant="tertiary" loading={busy === `d${e.id}`} onClick={() => act(`d${e.id}`, async () => { const r = await api(`/api/webhooks/${e.id}`, { method: "DELETE" }); if (r.ok) setEps((x) => x.filter((y) => y.id !== e.id)); return r; }, "Endpoint removed.")}>Remove</Button>
                  </div>
                ) : null}
              </li>
            ))}
            {!eps.length ? <li className="p-3 body-6 text-text-subtle">No endpoints for this form yet.</li> : null}
          </ul>
          {canManage ? (
            <form className="flex flex-col gap-3" onSubmit={create}>
              <Field label="Endpoint URL" htmlFor="wh-url" error={err}><Input id="wh-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.yoursite.com/postslot" required /></Field>
              <fieldset className="flex flex-wrap gap-x-5 gap-y-1"><legend className="title-4 pb-1 text-text">Events</legend>
                {events.map((ev) => (
                  <label key={ev} className="flex min-h-11 items-center gap-2 body-6 text-text"><input type="checkbox" checked={picked.includes(ev)} onChange={() => setPicked((p) => (p.includes(ev) ? p.filter((x) => x !== ev) : [...p, ev]))} className="size-5 accent-[var(--action)]" />{ev}</label>
                ))}
              </fieldset>
              <div><Button type="submit" loading={busy === "create"} disabled={!picked.length}>Add endpoint</Button></div>
            </form>
          ) : null}
          {note ? <p role="status" className="caption-2 text-text-subtle">{note}</p> : null}
        </div>
      </Panel>
      <Panel title="Delivery log" description="Every attempt, newest first. Replay sends the same event again with a new id; dedupe on the id field if you need to.">
        {log.data?.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {log.data.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex flex-wrap items-center gap-2"><Badge tone={TONE[d.status] ?? "info"}>{d.status}</Badge><span className="body-5 text-text">{d.event}</span><span className="caption-2 text-text-subtle">{d.lastStatusCode ?? d.lastError ?? "pending"} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"} · {formatDate(d.createdAt, true)}</span></span>
                {canManage ? <Button size="sm" variant="secondary" loading={busy === `r${d.id}`} onClick={() => act(`r${d.id}`, () => api(`/api/webhooks/deliveries/${d.id}/replay`, { method: "POST", body: {} }), "Replayed.")}>Replay</Button> : null}
              </li>
            ))}
          </ul>
        ) : <p className="body-6 text-text-subtle">{log.loading ? "Loading…" : "Nothing sent yet."}</p>}
      </Panel>
      <p className="caption-2 text-text-subtle">Payloads and verification: <Link href="/docs/webhooks" className="underline underline-offset-4">webhooks docs</Link>.</p>
    </div>
  );
}
