"use client";
import { useState } from "react";
import { api, hardNavigate } from "@/components/app/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** `defaultName` pre-fills the name so a first form is one click (the inbox empty state). */
export function CreateForm({ defaultName = "", label = "New form" }: { defaultName?: string; label?: string } = {}) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await api<{ form: { _id: string } }>("/api/forms", { body: { name } });
        if (r.ok) hardNavigate(`/app/forms/${r.data.form._id}`);
        else {
          setBusy(false);
          setError(r.code === "plan_required" ? "Your plan's recipient limit is reached. Remove a recipient or upgrade." : r.message);
        }
      }}
    >
      <div className="flex-1">
        <Field label={label} htmlFor="form-name" error={error} hint="For example Contact page or Studio waitlist. You can rename it later.">
          <Input id="form-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required aria-invalid={!!error} />
        </Field>
      </div>
      <Button type="submit" loading={busy} disabled={!name.trim()}>Create form</Button>
    </form>
  );
}
