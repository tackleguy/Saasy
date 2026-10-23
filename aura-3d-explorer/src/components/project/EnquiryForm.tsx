"use client";
/**
 * EnquiryForm — "Request Pro Forma" / "Book Viewing" call to action.
 * Posts to /api/enquiries, which stores the request and emails the sales team
 * when connected; the confirmation states exactly what happened.
 */
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { SegmentedControl } from "@/components/ui/primitives";
import { useEnquirySubmit } from "./useEnquirySubmit";

type Intent = "proforma" | "viewing";

interface Props {
  projectName: string;
  /** Project the enquiry is about (stored with it). */
  projectSlug?: string;
  /** Pre-filled unit reference (from the stacking plan). */
  unitCode?: string | null;
}

export default function EnquiryForm({ projectName, projectSlug, unitCode }: Props) {
  const [intent, setIntent] = useState<Intent>("viewing");
  const [unit, setUnit] = useState(unitCode ?? "");
  const [company, setCompany] = useState("");
  const { state, submit, reset } = useEnquirySubmit((form) => ({
    kind: "enquiry",
    projectSlug,
    name: form.get("name"),
    email: form.get("email"),
    company: intent === "proforma" ? company : null,
    message: form.get("message"),
    website: form.get("website"),
    details: { intent, ...(intent === "viewing" ? { unit } : { role: String(form.get("role") ?? "") }) },
  }));

  useEffect(() => {
    if (unitCode) {
      setUnit(unitCode);
      setIntent("viewing");
      reset();
    }
  }, [unitCode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.phase === "sent") {
    return (
      <div className="panel flex flex-col items-start gap-3 p-6" role="status">
        <CheckCircle2 className="text-positive" size={28} aria-hidden />
        <p className="font-serif text-2xl text-ink">{intent === "proforma" ? "Pro forma requested." : "Viewing requested."}</p>
        <p className="caption">
          {state.emailed
            ? `Your request for ${projectName} has been sent to the sales team. They will reply to ${state.email}.`
            : `Your request for ${projectName} has been received and saved for the sales team, who will reply to ${state.email}.`}
        </p>
        <button className="btn-secondary mt-2" onClick={reset}>
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <form className="panel space-y-4 p-6" onSubmit={submit}>
      <SegmentedControl
        ariaLabel="Enquiry type"
        layoutId={`enquiry-${projectName}`}
        value={intent}
        onChange={setIntent}
        options={[
          { value: "viewing", label: "Book Viewing" },
          { value: "proforma", label: "Request Pro Forma" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="caption">Full name</span>
          <input required name="name" autoComplete="name" className="field mt-1" />
        </label>
        <label className="block">
          <span className="caption">Email</span>
          <input required type="email" name="email" autoComplete="email" className="field mt-1" />
        </label>
        {intent === "proforma" && <label className="block">
          <span className="caption">Company</span>
          <input name="company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" className="field mt-1" />
        </label>}
        <label className="block">
          <span className="caption">{intent === "viewing" ? "Unit (optional)" : "Role"}</span>
          {intent === "viewing" ? (
            <input name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="field mt-1" placeholder="e.g. MER-1203" />
          ) : (
            <select name="role" className="field mt-1" defaultValue="Investor">
              <option>Investor</option>
              <option>Lender</option>
              <option>Buyer / agent</option>
              <option>Developer</option>
            </select>
          )}
        </label>
      </div>
      {/* Spam trap: hidden from people and assistive technology. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <label className="block">
        <span className="caption">Message</span>
        <textarea name="message" rows={3} className="field mt-1" placeholder={`I'd like to know more about ${projectName}.`} />
      </label>
      {state.phase === "error" && (
        <p role="alert" className="flex items-start gap-2 text-sm text-negative">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      )}
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={state.phase === "sending"} aria-busy={state.phase === "sending"}>
        {state.phase === "sending" ? "Sending…" : intent === "proforma" ? "Request pro forma" : "Book a viewing"}
      </button>
      <p className="caption">Your details are used only to reply to this request.</p>
    </form>
  );
}
