"use client";
/**
 * DemoRequestForm — demo request for developers.
 * Front-end mock: validates and confirms, sends nothing.
 * TODO: POST to your CRM / email service in the submit handler.
 */
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

export default function DemoRequestForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div className="panel flex flex-col gap-3 p-6" role="status">
        <CheckCircle2 className="text-positive" size={28} aria-hidden />
        <p className="font-serif text-2xl text-ink">Demo complete — no request sent.</p>
        <p className="caption">This preview does not send demo requests. Your details have not been submitted.</p>
      </div>
    );
  }
  return (
    <form
      className="panel grid gap-3 p-6 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
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
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary">
          Request a demo
        </button>
        <span className="caption">Demo form — submissions are not sent anywhere.</span>
      </div>
    </form>
  );
}
