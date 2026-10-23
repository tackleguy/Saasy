"use client";
import { useActionState } from "react";
import { createOrganization, createProject, type ActionState } from "@/app/(site)/app/actions";

function ErrorLine({ state }: { state: ActionState }) {
  return state.error ? <p role="alert" className="text-sm text-negative">{state.error}</p> : null;
}

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, {});
  return (
    <form action={action} className="panel mt-8 space-y-4 p-6">
      <label className="block">
        <span className="caption">Company name</span>
        <input required name="name" autoComplete="organization" className="field mt-1" />
      </label>
      <label className="block">
        <span className="caption">Short name for links (letters, numbers, dashes)</span>
        <input name="slug" pattern="[a-z0-9-]{2,48}" className="field mt-1" placeholder="e.g. harbor-developments" />
      </label>
      <ErrorLine state={state} />
      <button type="submit" className="btn-primary" disabled={pending} aria-busy={pending}>{pending ? "Creating…" : "Create company"}</button>
    </form>
  );
}

export function CreateProjectForm({ cities }: { cities: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createProject, {});
  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="block">
        <span className="caption">Project name</span>
        <input required name="name" className="field mt-1" />
      </label>
      <label className="block">
        <span className="caption">City</span>
        <input name="city" className="field mt-1" placeholder="e.g. Miami, FL" />
      </label>
      <label className="block">
        <span className="caption">City style for the 3D context</span>
        <select name="backdrop" className="field mt-1" defaultValue="generic">
          {cities.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <ErrorLine state={state} />
      <button type="submit" className="btn-primary w-full" disabled={pending} aria-busy={pending}>{pending ? "Creating…" : "Create project"}</button>
    </form>
  );
}
