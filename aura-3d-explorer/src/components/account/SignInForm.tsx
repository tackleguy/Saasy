"use client";
import { useState } from "react";
import { AlertCircle, MailCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignInForm({ next, initialError = "" }: { next: string; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState(initialError);

  if (state === "sent") {
    return (
      <div className="panel mt-8 flex flex-col gap-3 p-6" role="status">
        <MailCheck className="text-positive" size={28} aria-hidden />
        <p className="font-serif text-2xl text-ink">Check your inbox.</p>
        <p className="caption">We sent a sign-in link to {email}. Open it on this device to continue. It expires in an hour.</p>
        <button type="button" className="btn-secondary mt-2 self-start" onClick={() => setState("idle")}>Use a different email</button>
      </div>
    );
  }

  return (
    <form
      className="panel mt-8 space-y-4 p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const client = supabaseBrowser();
        if (!client) return setError("Accounts are not connected on this deployment yet.");
        setState("sending");
        setError("");
        const { error: failure } = await client.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
        });
        if (failure) {
          setState("idle");
          setError(failure.status === 429 ? "Too many sign-in emails. Wait a minute, then try again." : "We could not send the sign-in email. Check the address and try again.");
        } else setState("sent");
      }}
    >
      <label className="block">
        <span className="caption">Work email</span>
        <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1" />
      </label>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-negative">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={state === "sending"} aria-busy={state === "sending"}>
        {state === "sending" ? "Sending link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
