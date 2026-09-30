import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import DemoRequestForm from "@/components/developers/DemoRequestForm";
import SectionHeading from "@/components/site/SectionHeading";

export const metadata: Metadata = {
  title: "For Developers",
  description: "How AURA works for real estate developers: live 3D marketing, stacking plans and a developer-grade pro forma — for a 1% success fee.",
};

const STEPS = [
  { n: "01", title: "Send massing or CAD", body: "Drop an STL, DXF or DWG — or give us floor counts and plate sizes. We build the procedural model and interiors." },
  { n: "02", title: "Underwrite in the Studio", body: "Tune land, hard and soft costs, financing and zone pricing. See IRR, profit on cost and residual land value update live." },
  { n: "03", title: "Launch the project page", body: "A shareable page with renders, the live 3D model, walk-throughs, a stacking plan and enquiry capture." },
  { n: "04", title: "Sell, then pay", body: "Our fee is 1% of gross revenue on units that sell. No retainer, no licence, no setup fee." },
];

const INCLUDED = [
  "Procedural 3D model of every building and floor",
  "Furnished interiors and first-person walk-throughs",
  "Developer pro forma with IRR and sensitivities",
  "Stacking plan, unit sheets and enquiry capture",
  "Photo-angle presets and 2× render capture",
  "Saved scenarios and PDF pro-forma export",
];

const FAQ = [
  {
    q: "What exactly is the 1% success fee?",
    a: "1% of gross revenue from units that actually sell or lease through the marketing period. If nothing sells, you pay nothing. Compared with a typical 5% sales-and-marketing load it leaves more of the upside with the developer.",
  },
  { q: "Do I need a finished BIM model?", a: "No. Early massing is enough — floor counts and plate sizes per zone. CAD files (STL, DXF, DWG) can be ingested to speed things up." },
  { q: "Can I use my own renders?", a: "Yes. Project pages show your renders in the hero carousel alongside the live model. Drop them in and they replace the placeholders." },
  { q: "Are the figures on this site real?", a: "No. All sample projects, names and numbers are illustrative placeholders. Nothing here is investment or valuation advice." },
  { q: "Does it work on phones?", a: "Yes. The 3D viewport adapts its quality automatically, and the Studio stacks into a single column on small screens." },
];

export default function DevelopersPage() {
  return (
    <>
      <section className="shell grid gap-8 pb-20 pt-12 sm:pb-28 sm:pt-20 lg:grid-cols-12 lg:items-end">
        <h1 className="font-serif text-display-xl text-ink lg:col-span-8">
          <span className="rise-line"><span>Market, explore and</span></span>
          <span className="rise-line"><span style={{ animationDelay: "90ms" }}>underwrite <em className="italic text-oak">every</em> project.</span></span>
        </h1>
        <div className="fade-in lg:col-span-4 lg:pb-2" style={{ animationDelay: "250ms" }}>
          <p className="max-w-md text-[17px] leading-relaxed text-ink/80">
            One live model carries the renders, the pro forma and the sales desk. You pay 1% of gross revenue, only on units that sell.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="#demo" className="btn-primary btn-lg">
              Request a demo
            </Link>
            <Link href="/studio" className="btn-secondary btn-lg">
              Try the Studio
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how">
        <div className="shell pb-20 sm:pb-28">
          <SectionHeading id="how" title="How it works">
            Four steps from massing study to sold-out launch. You can start with nothing more than floor counts.
          </SectionHeading>
          <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((s) => (
              <li key={s.n} className="border-t border-plaster pt-5">
                <span className="font-serif text-[40px] leading-none tabular-nums text-oak">{s.n}</span>
                <h3 className="mt-4 font-serif text-[26px] leading-tight text-ink">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ash">{s.body}</p>
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

      {/* Testimonials — clearly labelled placeholders */}
      <section aria-labelledby="testimonials">
        <div className="shell py-20 sm:py-28">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="testimonials" className="font-serif text-display-md text-ink">
              What developers say
            </h2>
            <p className="caption">Placeholder testimonials — replace with real, attributed quotes before launch.</p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <figure key={n} className="panel p-6">
                <blockquote className="font-serif text-xl leading-snug text-ink">“Placeholder quote about faster approvals, clearer investor conversations or better sales velocity.”</blockquote>
                <figcaption className="caption mt-4">Placeholder name · Placeholder Developments</figcaption>
              </figure>
            ))}
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
              Request a demo
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ash">See your own project in AURA. We&apos;ll set up a walkthrough with your massing and numbers.</p>
          </div>
          <DemoRequestForm />
        </div>
      </section>
    </>
  );
}
