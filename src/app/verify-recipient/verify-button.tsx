"use client";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Button } from "@/components/ui/button";

export function VerifyButton({ token }: { token: string }) {
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" | "error"; text?: string }>({ kind: "idle" });
  if (state.kind === "done") return <p role="status" className="body-6 text-text">Confirmed. {state.text}</p>;
  return (
    <div className="flex flex-col gap-3">
      <Button
        loading={state.kind === "busy"}
        onClick={async () => {
          setState({ kind: "busy" });
          const r = await api<{ email: string; released: number }>("/api/recipients/verify", { body: { token } });
          setState(r.ok ? { kind: "done", text: `${r.data.email} will now get submissions${r.data.released ? `, including ${r.data.released} that were waiting` : ""}.` } : { kind: "error", text: r.code === "invalid_token" ? "This link is invalid or has expired. Ask for a new one from your form's page." : r.message });
        }}
      >
        Confirm address
      </Button>
      {state.kind === "error" ? <p role="alert" className="caption-2 text-danger">{state.text}</p> : null}
    </div>
  );
}
