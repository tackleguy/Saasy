"use client";
/**
 * SiteHeader — sticky, minimal global header.
 * Serif "AURA" wordmark, three text links and a single dark CTA. On phones the
 * links collapse into a sheet toggled by a menu button.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/projects", label: "Projects" },
  { href: "/studio", label: "Studio" },
  { href: "/developers", label: "For Developers" },
  { href: "/tour", label: "Live Reel" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile sheet on navigation.
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-plaster bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-8 px-4 sm:px-6">
        <Link href="/" className="font-serif text-[26px] leading-none tracking-tight text-ink" aria-label="AURA home">
          AURA
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={clsx(
                "text-sm transition-colors duration-300",
                isActive(n.href) ? "text-ink underline decoration-oak decoration-1 underline-offset-[6px]" : "text-ash hover:text-ink"
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/developers#demo" className="btn-primary hidden py-2 sm:inline-flex">
            Request Demo
          </Link>
          <button
            className="btn-ghost md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Primary"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-plaster bg-paper md:hidden"
          >
            <div className="flex flex-col px-4 py-3">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={clsx("py-2.5 text-base", isActive(n.href) ? "text-ink" : "text-ash")}>
                  {n.label}
                </Link>
              ))}
              <Link href="/developers#demo" className="btn-primary mt-2">
                Request Demo
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
