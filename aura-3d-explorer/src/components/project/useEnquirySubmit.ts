"use client";
import { useState, type FormEvent } from "react";

export type SubmitState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "sent"; emailed: boolean; email: string }
  | { phase: "error"; message: string };

/** POSTs a form to /api/enquiries and reports exactly what happened. */
export function useEnquirySubmit(build: (form: FormData) => Record<string, unknown>) {
  const [state, setState] = useState<SubmitState>({ phase: "idle" });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.phase === "sending") return;
    const form = new FormData(event.currentTarget);
    const payload = build(form);
    setState({ phase: "sending" });
    try {
      const res = await fetch("/api/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { emailed?: boolean; error?: string };
      if (!res.ok) setState({ phase: "error", message: data.error ?? "Your request was not sent. Please try again." });
      else setState({ phase: "sent", emailed: !!data.emailed, email: String(payload.email ?? "") });
    } catch {
      setState({ phase: "error", message: "You appear to be offline. Your request was not sent; please try again." });
    }
  };
  return { state, submit, reset: () => setState({ phase: "idle" }) };
}
