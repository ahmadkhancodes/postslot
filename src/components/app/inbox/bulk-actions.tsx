"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Button } from "@/components/ui/button";

/** One click for every row on the page: release all spam that was caught by mistake, or mark a page of junk as spam. */
export function BulkActions({ ids, mode }: { ids: string[]; mode: "spam" | "inbox" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  if (!ids.length) return null;
  const action = mode === "spam" ? "not_spam" : "spam";
  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await api<{ done: number; skipped: number }>("/api/submissions/bulk", { body: { action, ids: ids.slice(0, 100) } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "err", text: r.message });
    setMsg({ tone: "ok", text: `${r.data.done} ${action === "not_spam" ? "released and on their way to your recipients" : "marked as spam"}${r.data.skipped ? `, ${r.data.skipped} skipped (already handled)` : ""}.` });
    router.refresh();
  }
  const n = Math.min(ids.length, 100);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="md" loading={busy} onClick={run}>
        {mode === "spam" ? `Not spam: release these ${n}` : `Mark these ${n} as spam`}
      </Button>
      {msg ? <p role={msg.tone === "err" ? "alert" : "status"} className={`caption-2 ${msg.tone === "err" ? "text-danger" : "text-text-subtle"}`}>{msg.text}</p> : null}
    </div>
  );
}
