import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { FLAGSHIP, PROJECTS } from "@/content/projects";
import HeroExplorer from "@/components/home/HeroExplorer";
import ProjectGrid from "@/components/portfolio/ProjectGrid";
import SectionHeading from "@/components/site/SectionHeading";

/** What a developer (or their buyer) can actually do — and where. */
const CAPABILITIES = [
  { title: "Live 3D site", body: "Every building on the plot, orbitable in the browser. No plugin, no download, any device.", where: "Studio", href: "/studio" },
  { title: "Exploded stack & core", body: "Pull the tower apart floor by floor, then x-ray through the facade to the core and lifts.", where: "Studio", href: "/studio" },
  { title: "Walk-throughs", body: "Isolate a floor and step inside: furnished interiors, walked in first person.", where: "Studio", href: "/studio" },
  { title: "City backdrops", body: "Stage the scheme against the skyline of the market you are selling into, one click per city.", where: "Home", href: "/#hero" },
  { title: "CAD import", body: "Drop STL, DXF or DWG massing and see it placed on site, next to the procedural model.", where: "Studio", href: "/studio" },
  { title: "Pro-forma yield", body: "Costs, financing, IRR, residual land value and sensitivities, recalculated as you drag.", where: "Studio", href: "/studio" },
  { title: "Cinematic reel", body: "An auto-directed camera reel of the live model, made for launch events and lobby screens.", where: "Live reel", href: "/tour" },
  { title: "AI assistant", body: "Ask about a scheme, a floor or a figure and get an answer in context, from an assistant that runs locally.", where: "Everywhere", href: null },
] as const;

const PILLARS = [
  { title: "Visualise", body: "Massing or CAD becomes a live model buyers can orbit, explode and walk through." },
  { title: "Underwrite", body: "A developer-grade pro forma sits beside the model, so every number has a floor attached." },
  { title: "Sell", body: "Stacking plans, unit sheets and enquiry capture on every project page." },
];

export default function Home() {
  const featured = PROJECTS.filter((p) => !p.flagship).slice(0, 6);

  return (
    <>
      {/* Hero — statement, then the live model as the plate */}
      <section id="hero" aria-labelledby="hero-title" className="scroll-mt-16">
        <div className="shell grid gap-8 pb-10 pt-10 sm:pb-14 sm:pt-16 lg:grid-cols-12 lg:items-end">
          <h1 id="hero-title" className="font-serif text-display-xl text-ink lg:col-span-8">
            <span className="rise-line">
              <span>Walk the building</span>
            </span>
            <span className="rise-line">
              <span style={{ animationDelay: "90ms" }}>
                <em className="italic text-oak">before</em> it&rsquo;s built.
              </span>
            </span>
          </h1>
          <div className="fade-in lg:col-span-4 lg:pb-2" style={{ animationDelay: "250ms" }}>
            <p className="max-w-md text-[17px] leading-relaxed text-ink/80">
              AURA turns a development into a live 3D model with the pro forma attached. Developers use it to underwrite, investors to decide, and
              buyers to choose their floor.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/tour" className="btn-primary btn-lg">
                Watch the live reel
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link href="/studio" className="btn-secondary btn-lg">
                Open the Studio
              </Link>
            </div>
          </div>
        </div>
        <HeroExplorer project={FLAGSHIP} />
      </section>

      {/* Capabilities — an index, not a card grid */}
      <section aria-labelledby="capabilities" className="shell py-20 sm:py-28">
        <SectionHeading id="capabilities" title="Everything a scheme needs to be understood.">
          From the first massing study to the last unit sold, one model carries the drawings, the numbers and the sales story.
        </SectionHeading>
        <ul className="mt-12 border-t border-plaster sm:mt-16">
          {CAPABILITIES.map((c) => {
            const row = (
              <>
                <h3 className="font-serif text-[28px] leading-tight text-ink transition-transform duration-500 ease-calm group-hover:translate-x-2 sm:text-[32px] md:col-span-4">
                  {c.title}
                </h3>
                <p className="max-w-lg text-[15px] leading-relaxed text-ash md:col-span-6">{c.body}</p>
                <span className="flex items-center gap-2 text-[13px] text-ink md:col-span-2 md:justify-end">
                  {c.where}
                  {c.href && <ArrowUpRight size={16} className="text-ash transition-colors group-hover:text-oak" aria-hidden />}
                </span>
              </>
            );
            const cls = "grid gap-2 py-6 md:grid-cols-12 md:items-baseline md:gap-8 md:py-8";
            return (
              <li key={c.title} className="border-b border-plaster">
                {c.href ? (
                  <Link href={c.href} className={`group ${cls} -mx-3 px-3 transition-colors duration-300 hover:bg-stone/60`}>
                    {row}
                  </Link>
                ) : (
                  <div className={`group ${cls}`}>{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Selected projects */}
      <section aria-labelledby="portfolio" className="shell pb-20 sm:pb-28">
        <SectionHeading
          id="portfolio"
          title="Selected projects"
          action={
            <Link href="/projects" className="btn-secondary">
              All {PROJECTS.length} projects
              <ArrowRight size={16} aria-hidden />
            </Link>
          }
        >
          Hover a project to scrub through its renders. Each one opens into its own live model, stacking plan and enquiry desk.
        </SectionHeading>
        <div className="mt-12 sm:mt-16">
          <ProjectGrid projects={featured} priorityCount={0} layout="feature" />
        </div>
      </section>

      {/* For developers */}
      <section aria-labelledby="for-developers" className="bg-stone">
        <div className="shell py-20 sm:py-28">
          <SectionHeading
            id="for-developers"
            title={
              <>
                One platform. One fee, <em className="italic">only when units sell.</em>
              </>
            }
            action={
              <Link href="/developers" className="btn-primary">
                How AURA works
                <ArrowRight size={16} aria-hidden />
              </Link>
            }
          >
            1% of gross revenue on units sold. No retainer, no licence, no setup fee, against a typical 5% sales and marketing load.
          </SectionHeading>
          <ul className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {PILLARS.map((p) => (
              <li key={p.title} className="border-t border-ink/20 pt-5">
                <h3 className="font-serif text-[32px] leading-none text-ink">{p.title}</h3>
                <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-ash">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing call to action */}
      <section aria-labelledby="cta" className="bg-ink text-paper">
        <div className="shell py-20 sm:py-28">
          <h2 id="cta" className="sr-only">
            Get started
          </h2>
          <ul className="border-t border-paper/20">
            {[
              { href: "/tour", title: "Watch the live reel", body: "A self-running tour of the portfolio: aerials, exploded stacks, walk-throughs. Rendered live, never pre-baked." },
              { href: "/studio", title: "Open the Studio", body: "Explode the stack, walk a floor and run the numbers yourself." },
            ].map((c) => (
              <li key={c.href} className="border-b border-paper/20">
                <Link
                  href={c.href}
                  className="group grid gap-3 py-10 focus-visible:outline-paper sm:py-14 md:grid-cols-12 md:items-end md:gap-8"
                >
                  <span className="flex items-center gap-4 font-serif text-display-lg text-paper md:col-span-8">
                    {c.title}
                    <ArrowRight
                      className="h-[0.6em] w-[0.6em] shrink-0 -translate-x-2 opacity-60 transition-[transform,opacity] duration-500 ease-calm group-hover:translate-x-2 group-hover:opacity-100"
                      aria-hidden
                    />
                  </span>
                  <span className="max-w-sm text-[15px] leading-relaxed text-paper/70 md:col-span-4 md:pb-3">{c.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
