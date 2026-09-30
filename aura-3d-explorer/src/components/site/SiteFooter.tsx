/**
 * SiteFooter — oversized wordmark, grouped links and the legal disclaimer.
 */
import Link from "next/link";

const GROUPS = [
  {
    title: "Explore",
    links: [
      { href: "/projects", label: "Projects" },
      { href: "/tour", label: "Live reel" },
      { href: "/studio", label: "Studio" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/developers", label: "How AURA works" },
      { href: "/developers#pricing", label: "Pricing" },
      { href: "/developers#demo", label: "Request a demo" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="no-print border-t border-plaster bg-paper">
      <div className="shell grid gap-12 py-14 md:grid-cols-12 md:py-20">
        <div className="md:col-span-5">
          <p className="font-serif text-6xl leading-none tracking-tight text-ink sm:text-7xl">AURA</p>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-ash">
            Visualise, underwrite and sell real estate developments, in the browser.
          </p>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title} className="md:col-span-2">
            <p className="label">{g.title}</p>
            <ul className="mt-4 space-y-2.5">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="link-draw text-[15px] text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="space-y-2 text-xs leading-relaxed text-ash md:col-span-3">
          <p>
            <strong className="font-medium text-ink">Illustrative figures only.</strong> Nothing on this site is investment, valuation or financial
            advice.
          </p>
          <p>Sample projects, names and imagery are placeholders for demonstration.</p>
        </div>
      </div>
      <div className="border-t border-plaster">
        <div className="shell flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-ash">
          <p>© {new Date().getFullYear()} AURA Development Platform</p>
          <p>Live 3D · Pro forma · Stacking plans</p>
        </div>
      </div>
    </footer>
  );
}
