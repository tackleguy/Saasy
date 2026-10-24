import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";
import { Newsletter } from "./newsletter";

const help = [
  { slug: "about", label: "About Us" },
  { slug: "contact", label: "Contact" },
  { slug: "shipping-returns", label: "Shipping & Returns" },
  { slug: "size-guide", label: "Size Guide" },
  { slug: "faq", label: "FAQ" },
  { slug: "privacy", label: "Privacy Policy" },
  { slug: "terms", label: "Terms of Service" },
] as const;

export function SiteFooter() {
  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-[1500px] gap-12 px-5 py-16 md:grid-cols-4 md:px-10">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 text-sm opacity-60">Made for the Outside.</p>
          <div className="mt-8 max-w-md"><Newsletter compact /></div>
        </div>
        <div>
          <p className="eyebrow mb-4 opacity-60">Shop</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/shop" className="hover:opacity-70">Shop All</Link></li>
            <li><Link to="/story" className="hover:opacity-70">Our Story</Link></li>
            <li><a href="https://instagram.com" target="_blank" rel="noreferrer" className="hover:opacity-70">Instagram</a></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4 opacity-60">Help</p>
          <ul className="space-y-2 text-sm">
            {help.map((h) => (
              <li key={h.slug}><Link to="/info/$page" params={{ page: h.slug }} className="hover:opacity-70">{h.label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-[1500px] border-t border-ink-foreground/15 px-5 py-6 text-xs opacity-50 md:px-10">
        © {new Date().getFullYear()} The Conservation Collective
      </div>
    </footer>
  );
}
