import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";
import DemoRequestForm from "@/components/developers/DemoRequestForm";
import SectionHeading from "@/components/site/SectionHeading";

export const metadata: Metadata = {
  title: "For Developers",
  description: "Early access for real estate developers: your project on its real site in live 3D, with a stacking plan, a pro forma and branded share links.",
};

const STEPS = [
  { n: "01", title: "Enter the address", body: "Search your site's address. AURA places the scheme on its real footprint with the surrounding buildings, streets and water from OpenStreetMap and Overture map data.", image: "/developers/step-1-address.jpg", alt: "The AURA project editor with a project placed at 200 Hudson Street, Jersey City, among the mapped surrounding buildings" },
  { n: "02", title: "Shape the massing or upload your model", body: "Set floors, plate sizes, shape, twist and taper per building, or upload your own GLB, STL or DXF. The pro forma recalculates as you go.", image: "/developers/step-2-massing.jpg", alt: "The massing editor beside the live 3D model and the development appraisal" },
  { n: "03", title: "Send a live link", body: "Create a share link with your logo: the 3D model, renders, key facts and availability. Add a password or an expiry, and choose whether to share the pro forma.", image: "/developers/step-3-link.jpg", alt: "A company-branded share link opened in a private browser window, with key facts and the live 3D model" },
];

const INCLUDED = [
  "Live 3D model of every building on its real site",
  "Your own model (GLB, STL, DXF) or editable massing",
  "Furnished interiors and first-person walk-throughs",
  "Developer pro forma with IRR and sensitivities",
  "Stacking plan, unit sheets and enquiry capture",
  "Branded share links with passwords and expiry",
  "PDF and Excel pro forma exports",
  "2× stills saved to the project gallery",
];

const FAQ = [
  {
    q: "What exactly is the 1% success fee?",
    a: "1% of gross revenue from units that actually sell or lease through the marketing period. If nothing sells, you pay nothing. Compared with a typical 5% sales-and-marketing load it leaves more of the upside with the developer. There is no billing in the product today; terms are agreed with each early-access developer.",
  },
  { q: "Do I need a finished BIM model?", a: "No. Early massing is enough: floor counts and plate sizes per zone. If you have a model, upload it as GLB, STL or DXF (up to 50 MB) and it replaces the generated tower." },
  { q: "How accurate are the surroundings?", a: "Building footprints, streets, parks and water come from OpenStreetMap and Overture map data. Heights are mapped heights or estimated from floor counts; buildings with neither are flat footprints. Facades, roofs and street furniture are illustrative." },
  { q: "Can I use my own renders?", a: "Yes. Upload up to three images per project, or save stills from the live model. They appear on the project page and its share links." },
  { q: "Who can see my projects?", a: "Only members of your company, plus anyone you send a share link to. Links can carry a password and an expiry and can be revoked at any time; revoking takes effect immediately." },
  { q: "Are the sample projects on this site real?", a: "No. The portfolio's projects, names and numbers are illustrative samples. Nothing here is investment or valuation advice." },
];

export default function DevelopersPage() {
  return (
    <>
      <section className="shell grid gap-8 pb-20 pt-12 sm:pb-28 sm:pt-20 lg:grid-cols-12 lg:items-end">
        <h1 className="font-serif text-display-xl text-ink lg:col-span-8">
          <span className="rise-line"><span>Your address, your massing,</span></span>
          <span className="rise-line"><span style={{ animationDelay: "90ms" }}>a <em className="italic text-oak">live</em> link.</span></span>
        </h1>
        <div className="fade-in lg:col-span-4 lg:pb-2" style={{ animationDelay: "250ms" }}>
          <p className="caption mb-3 uppercase tracking-[0.18em] text-oak">Early access</p>
          <p className="max-w-md text-[17px] leading-relaxed text-ink/80">
            Put your own project into a live 3D presentation on its real site, with a stacking plan and a pro forma you can hand to investors, lenders and buyers.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="#demo" className="btn-primary btn-lg">
              Request early access
            </Link>
            <Link href="/sign-in" className="btn-secondary btn-lg">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how">
        <div className="shell pb-20 sm:pb-28">
          <SectionHeading id="how" title="How it works">
            Three steps from an address to a link you can send. Screens below are from AURA itself.
          </SectionHeading>
          <ol className="mt-14 space-y-16">
            {STEPS.map((s) => (
              <li key={s.n} className="grid gap-6 border-t border-plaster pt-6 lg:grid-cols-12 lg:gap-10">
                <div className="lg:col-span-4">
                  <span className="font-serif text-[40px] leading-none tabular-nums text-oak">{s.n}</span>
                  <h3 className="mt-4 font-serif text-[30px] leading-tight text-ink">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-ash">{s.body}</p>
                </div>
                <div className="relative aspect-[16/10] overflow-hidden border border-plaster bg-stone lg:col-span-8">
                  <Image src={s.image} alt={s.alt} fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover object-top" />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section aria-labelledby="pricing" className="bg-stone">
        <div className="shell grid gap-10 py-20 sm:py-28 lg:grid-cols-2">
          <div>
            <h2 id="pricing" className="font-serif text-display-md text-ink">
              Pricing
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ash">One aligned fee. We only earn when your units sell — so our incentive is the same as yours.</p>
          </div>
          <div className="panel p-8">
            <p className="caption">Success fee</p>
            <p className="mt-1 font-serif text-7xl leading-none text-ink">1%</p>
            <p className="mt-2 text-sm text-ash">of gross revenue on units sold · vs. a typical 5% sales &amp; marketing load</p>
            <ul className="mt-6 space-y-2 border-t border-plaster pt-5">
              {INCLUDED.map((i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink">
                  <Check size={16} className="mt-0.5 shrink-0 text-oak" aria-hidden />
                  {i}
                </li>
              ))}
            </ul>
            <Link href="#demo" className="btn-primary mt-6 w-full">
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq">
        <div className="shell grid gap-10 py-20 sm:py-28 lg:grid-cols-[1fr_2fr]">
          <h2 id="faq" className="font-serif text-display-md text-ink">
            FAQ
          </h2>
          <div className="border-t border-plaster">
            {FAQ.map((f) => (
              <details key={f.q} className="group border-b border-plaster py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-[22px] leading-snug text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oak/40">
                  {f.q}
                  <span className="text-ash transition-transform duration-300 group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ash">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Demo request */}
      <section aria-labelledby="demo-title" id="demo" className="scroll-mt-20 border-t border-plaster bg-stone/50">
        <div className="shell grid gap-10 py-20 sm:py-28 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="demo-title" className="font-serif text-display-md text-ink">
              Request early access
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ash">Tell us about your next project. We will reply by email to set up your company and bring your first project in with you.</p>
          </div>
          <DemoRequestForm />
        </div>
      </section>
    </>
  );
}
