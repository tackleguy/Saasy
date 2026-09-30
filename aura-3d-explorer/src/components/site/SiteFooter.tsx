/**
 * SiteFooter — wordmark, links and the legal disclaimer.
 */
import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="no-print border-t border-plaster bg-paper">
      <div className="mx-auto grid max-w-[1600px] gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <p className="font-serif text-2xl text-ink">AURA</p>
          <p className="caption mt-2 max-w-xs">Visualise, underwrite and sell real estate developments — in the browser.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2 text-sm">
          <Link href="/projects" className="text-ash hover:text-ink">Projects</Link>
          <Link href="/studio" className="text-ash hover:text-ink">Studio</Link>
          <Link href="/developers" className="text-ash hover:text-ink">For Developers</Link>
          <Link href="/developers#demo" className="text-ash hover:text-ink">Request Demo</Link>
        </nav>
        <div className="caption space-y-2">
          <p>
            <strong className="font-medium text-ink">Illustrative figures only.</strong> Nothing on this site is investment, valuation or
            financial advice.
          </p>
          <p>Sample projects, names and imagery are placeholders for demonstration.</p>
        </div>
      </div>
      <div className="border-t border-plaster">
        <p className="caption mx-auto max-w-[1600px] px-4 py-4 sm:px-6">© {new Date().getFullYear()} AURA Development Platform</p>
      </div>
    </footer>
  );
}
