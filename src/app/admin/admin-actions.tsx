"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

type Payload = Record<string, unknown> & { type: string };

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function run(body: Payload, after?: () => void) {
    setBusy(true); setError(null); setDone(false);
    const r = await api("/api/admin/action", { body });
    setBusy(false);
    if (r.ok) { setDone(true); after?.(); router.refresh(); } else setError(r.code === "invalid_input" ? "Check the values and try again." : r.message);
  }
  return { busy, error, done, run };
}

const Status = ({ error, done }: { error: string | null; done: boolean }) =>
  error ? <p role="alert" className="caption-2 text-danger">{error}</p> : done ? <p role="status" className="caption-2 text-text-subtle">Saved and written to the audit log.</p> : null;

/** One-click action (suspend, unsuspend, remove) with an optional reason. */
export function ActionButton({ payload, label, variant = "secondary", askReason = false }: { payload: Payload; label: string; variant?: "primary" | "secondary" | "danger"; askReason?: boolean }) {
  const { busy, error, done, run } = useAction();
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {askReason ? <Input aria-label={`Reason for: ${label}`} placeholder="Reason (kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="sm:w-2xs" /> : null}
        <Button variant={variant} size="md" loading={busy} onClick={() => run({ ...payload, ...(askReason && reason ? { reason } : {}) })}>{label}</Button>
      </div>
      <Status error={error} done={done} />
    </div>
  );
}

export function PlanForm({ orgId, current, plans }: { orgId: string; current: string; plans: { id: string; name: string }[] }) {
  const { busy, error, done, run } = useAction();
  const [plan, setPlan] = useState(current);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void run({ type: "plan.set", orgId, plan }); }}>
      <Field label="Plan override" htmlFor="plan-set" hint="Grants the plan without Stripe. A Stripe subscription recomputes it unless this is a manual grant. Free clears it.">
        <Select id="plan-set" value={plan} onChange={(e) => setPlan(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      </Field>
      <div><Button type="submit" loading={busy}>Set plan</Button></div>
      <Status error={error} done={done} />
    </form>
  );
}

export function LimitForm({ orgId, meters }: { orgId: string; meters: { id: string; label: string }[] }) {
  const { busy, error, done, run } = useAction();
  const [meter, setMeter] = useState(meters[0]?.id ?? "submissions");
  const [value, setValue] = useState("");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void run({ type: "limit.set", orgId, meter, value: value === "" ? null : Number(value) }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Limit" htmlFor="limit-meter"><Select id="limit-meter" value={meter} onChange={(e) => setMeter(e.target.value)}>{meters.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
        <Field label="New value" htmlFor="limit-value" hint="Leave empty to remove the override."><Input id="limit-value" inputMode="numeric" pattern="[0-9]*" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} /></Field>
      </div>
      <div><Button type="submit" loading={busy}>Set limit</Button></div>
      <Status error={error} done={done} />
    </form>
  );
}

export function SuppressionAdd() {
  const { busy, error, done, run } = useAction();
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState("all");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void run({ type: "suppression.add", email, scope: scope || "all" }, () => setEmail("")); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email address" htmlFor="sup-email"><Input id="sup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Scope" htmlFor="sup-scope" hint='"all" or org:<workspace id>.'><Input id="sup-scope" value={scope} onChange={(e) => setScope(e.target.value)} /></Field>
      </div>
      <div><Button type="submit" loading={busy}>Suppress address</Button></div>
      <Status error={error} done={done} />
    </form>
  );
}
