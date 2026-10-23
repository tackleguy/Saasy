"use client";
/**
 * DemoRequestForm — early-access / demo request for developers.
 * Posts to /api/enquiries (stored, and emailed when connected); the
 * confirmation states exactly what happened.
 */
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEnquirySubmit } from "@/components/project/useEnquirySubmit";

export default function DemoRequestForm() {
  const { state, submit } = useEnquirySubmit((form) => ({
    kind: "demo",
    name: form.get("name"),
    email: form.get("email"),
    company: form.get("company"),
    message: form.get("message"),
    website: form.get("website"),
    details: { pipeline: String(form.get("pipeline") ?? "") },
  }));
  if (state.phase === "sent") {
    return (
      <div className="panel flex flex-col gap-3 p-6" role="status">
        <CheckCircle2 className="text-positive" size={28} aria-hidden />
        <p className="font-serif text-2xl text-ink">Request received.</p>
        <p className="caption">
          {state.emailed ? `Thank you. Your request has been sent; we will reply to ${state.email}.` : `Thank you. Your request has been saved; we will reply to ${state.email}.`}
        </p>
      </div>
    );
  }
  return (
    <form className="panel grid gap-3 p-6 sm:grid-cols-2" onSubmit={submit}>
      <label className="block">
        <span className="caption">Full name</span>
        <input required name="name" autoComplete="name" className="field mt-1" />
      </label>
      <label className="block">
        <span className="caption">Work email</span>
        <input required type="email" name="email" autoComplete="email" className="field mt-1" />
      </label>
      <label className="block">
        <span className="caption">Company</span>
        <input required name="company" autoComplete="organization" className="field mt-1" />
      </label>
      <label className="block">
        <span className="caption">Pipeline</span>
        <select name="pipeline" className="field mt-1" defaultValue="1–3 projects">
          <option>1–3 projects</option>
          <option>4–10 projects</option>
          <option>10+ projects</option>
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="caption">Tell us about your next project</span>
        <textarea name="message" rows={3} className="field mt-1" />
      </label>
      {/* Spam trap: hidden from people and assistive technology. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {state.phase === "error" && (
        <p role="alert" className="flex items-start gap-2 text-sm text-negative sm:col-span-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={state.phase === "sending"} aria-busy={state.phase === "sending"}>
          {state.phase === "sending" ? "Sending…" : "Request early access"}
        </button>
        <span className="caption">Your details are used only to reply to this request.</span>
      </div>
    </form>
  );
}
