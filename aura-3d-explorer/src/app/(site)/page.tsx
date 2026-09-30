import Link from "next/link";
import { Box, Calculator, Megaphone } from "lucide-react";
import { FLAGSHIP, PROJECTS } from "@/content/projects";
import HeroExplorer from "@/components/home/HeroExplorer";
import ProjectGrid from "@/components/portfolio/ProjectGrid";

const VALUE_PROPS = [
  {
    icon: Box,
    title: "Visualise",
    body: "Turn massing or CAD into a live 3D model buyers can orbit, explode and walk through — no plugins, any device.",
  },
  {
    icon: Calculator,
    title: "Underwrite",
    body: "A developer-grade pro forma beside the model: costs, financing, IRR, residual land value and sensitivities, live.",
  },
  {
    icon: Megaphone,
    title: "Sell",
    body: "Stacking plans, unit sheets and enquiry capture on every project page. We earn 1% only when units sell.",
  },
];

export default function Home() {
  return (
    <>
      <HeroExplorer project={FLAGSHIP} />

      <section aria-labelledby="portfolio" className="mx-auto w-full max-w-[1600px] px-4 pb-6 pt-14 sm:px-6">
        <header className="mb-6 flex items-end justify-between gap-4">
          <h2 id="portfolio" className="font-serif text-4xl text-ink sm:text-5xl">
            Selected projects
          </h2>
          <Link href="/projects" className="btn-ghost text-sm">
            All projects →
          </Link>
        </header>
        <ProjectGrid projects={PROJECTS.filter((p) => !p.flagship)} priorityCount={0} />
      </section>

      <section aria-labelledby="for-developers" className="border-t border-plaster bg-stone/50">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-14 sm:px-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 id="for-developers" className="font-serif text-4xl text-ink sm:text-5xl">
              For developers
            </h2>
            <Link href="/developers" className="btn-primary">
              How AURA works
            </Link>
          </div>
          <ul className="grid gap-8 sm:grid-cols-3">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Icon size={20} className="text-oak" aria-hidden />
                <h3 className="mt-3 text-[15px] font-medium text-ink">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ash">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
