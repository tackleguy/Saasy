"use client";
/**
 * EnquiryForm — "Request Pro Forma" / "Book Viewing" call to action.
 * Front-end mock: validates and shows a confirmation, but sends nothing.
 * TODO: POST to your CRM (HubSpot, Salesforce, Resend…) in `submit`.
 */
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { SegmentedControl } from "@/components/ui/primitives";

type Intent = "proforma" | "viewing";

interface Props {
  projectName: string;
  /** Pre-filled unit reference (from the stacking plan). */
  unitCode?: string | null;
}

export default function EnquiryForm({ projectName, unitCode }: Props) {
  const [intent, setIntent] = useState<Intent>("proforma");
  const [sent, setSent] = useState(false);
  const [unit, setUnit] = useState(unitCode ?? "");

  useEffect(() => {
    if (unitCode) {
      setUnit(unitCode);
      setIntent("viewing");
      setSent(false);
    }
  }, [unitCode]);

  if (sent) {
    return (
      <div className="panel flex flex-col items-start gap-3 p-6" role="status">
        <CheckCircle2 className="text-positive" size={28} aria-hidden />
        <p className="font-serif text-2xl text-ink">Demo complete — no request sent.</p>
        <p className="caption">
          This is a demo form: nothing was sent. In production your {intent === "proforma" ? "pro forma pack" : "viewing request"} for {projectName} would go to the
          sales team.
        </p>
        <button className="btn-secondary mt-2" onClick={() => setSent(false)}>
          Return to form
        </button>
      </div>
    );
  }

  return (
    <form
      className="panel space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <SegmentedControl
        ariaLabel="Enquiry type"
        layoutId={`enquiry-${projectName}`}
        value={intent}
        onChange={setIntent}
        options={[
          { value: "proforma", label: "Request Pro Forma" },
          { value: "viewing", label: "Book Viewing" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
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
          <input name="company" autoComplete="organization" className="field mt-1" />
        </label>
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
      <label className="block">
        <span className="caption">Message</span>
        <textarea name="message" rows={3} className="field mt-1" placeholder={`I'd like to know more about ${projectName}.`} />
      </label>
      <button type="submit" className="btn-primary w-full sm:w-auto">
        {intent === "proforma" ? "Request pro forma" : "Book a viewing"}
      </button>
      <p className="caption">Demo form — submissions are not sent anywhere.</p>
    </form>
  );
}
