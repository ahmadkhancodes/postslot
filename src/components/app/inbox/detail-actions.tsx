"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Button } from "@/components/ui/button";

const ERRORS: Record<string, string> = {
  held_over_limit: "This submission is held because the plan limit was reached. It is released when the month resets or you upgrade.",
  no_recipient: "No confirmed recipient yet. Confirm an address on the form first.",
  is_spam: "This submission is in spam. Use Not spam to release it.",
};

export function DetailActions({ id, status, canWrite }: { id: string; status: string; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  if (!canWrite) return null;
  async function run(action: "not_spam" | "spam" | "redeliver", ok: string) {
    setBusy(action);
    setMsg(null);
    const r = await api(`/api/submissions/${id}`, { body: { action } });
    setBusy(null);
    if (!r.ok) setMsg({ tone: "err", text: ERRORS[r.code] ?? r.message });
    else {
      setMsg({ tone: "ok", text: ok });
      router.refresh();
    }
  }
  const spam = status === "quarantined";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {spam ? (
          <Button variant="primary" size="md" loading={busy === "not_spam"} onClick={() => run("not_spam", "Released. It is on its way to your recipients.")}>Not spam</Button>
        ) : (
          <>
            <Button variant="secondary" size="md" loading={busy === "redeliver"} onClick={() => run("redeliver", "Sent again. See the new stamps in the receipt.")}>Redeliver</Button>
            <Button variant="tertiary" size="md" loading={busy === "spam"} onClick={() => run("spam", "Marked as spam and removed from your quota.")}>Mark spam</Button>
          </>
        )}
      </div>
      {msg ? <p role={msg.tone === "err" ? "alert" : "status"} className={`caption-2 ${msg.tone === "err" ? "text-danger" : "text-text-subtle"}`}>{msg.text}</p> : null}
    </div>
  );
}
