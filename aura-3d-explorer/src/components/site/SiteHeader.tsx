"use client";
/**
 * SiteHeader — sticky global header.
 * Serif wordmark, text links with a drawn underline for the active page, the
 * live reel flagged with a pulsing dot, and one dark CTA. The header gains a
 * hairline only once the page scrolls. On phones the links open a full-height
 * sheet with large serif links.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/projects", label: "Projects" },
  { href: "/studio", label: "Studio" },
  { href: "/developers", label: "For Developers" },
  { href: "/tour", label: "Live Reel", live: true },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close the mobile sheet on navigation.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock page scroll and close on Escape while the mobile sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={clsx(
        "no-print sticky top-0 z-40 border-b bg-paper/90 backdrop-blur-md transition-colors duration-500",
        scrolled || open ? "border-plaster" : "border-transparent"
      )}
    >
      <div className="shell flex h-16 items-center gap-10">
        <Link href="/" className="font-serif text-[28px] leading-none tracking-tight text-ink" aria-label="AURA home">
          AURA
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={clsx(
                "link-draw flex items-center gap-2 text-sm transition-colors duration-300",
                isActive(n.href) ? "bg-[length:100%_1px] text-ink" : "text-ash hover:text-ink"
              )}
            >
              {n.live && <span className="live-dot h-1.5 w-1.5 rounded-full bg-negative" aria-hidden />}
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/developers#demo" className="btn-primary hidden sm:inline-flex">
            Request a demo
          </Link>
          <button
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center text-ink md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Primary"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="absolute inset-x-0 top-full h-[calc(100dvh-4rem)] overflow-y-auto border-t border-plaster bg-paper md:hidden"
          >
            <ul className="shell flex flex-col pt-4">
              {NAV.map((n, i) => (
                <motion.li
                  key={n.href}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.04 + i * 0.05, ease: EASE }}
                  className="border-b border-plaster"
                >
                  <Link
                    href={n.href}
                    aria-current={isActive(n.href) ? "page" : undefined}
                    className={clsx("flex items-center justify-between py-4 font-serif text-4xl", isActive(n.href) ? "text-ink" : "text-ink/80")}
                  >
                    <span className="flex items-center gap-3">
                      {n.label}
                      {n.live && <span className="live-dot h-2 w-2 rounded-full bg-negative" aria-hidden />}
                    </span>
                    <ArrowUpRight size={22} className="text-ash" aria-hidden />
                  </Link>
                </motion.li>
              ))}
            </ul>
            <div className="shell py-8">
              <Link href="/developers#demo" className="btn-primary btn-lg w-full">
                Request a demo
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
