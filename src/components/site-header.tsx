import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { Logo } from "./logo";

const nav = [
  { label: "Shop All", search: {} },
  { label: "T-Shirts", search: { category: "t-shirts" } },
  { label: "Hoodies", search: { category: "hoodies" } },
  { label: "Bottoms", search: { category: "bottoms" } },
  { label: "Outerwear", search: { category: "outerwear" } },
] as const;

export function SiteHeader() {
  const { count, setOpen } = useCart();
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(false);
    setMenu(false);
    navigate({ to: "/shop", search: { q: q || undefined } });
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-4 px-5 md:px-10">
        <button className="lg:hidden" aria-label="Open menu" onClick={() => setMenu(true)}>
          <Menu className="size-5" />
        </button>
        <Link to="/" aria-label="The Conservation Collective — home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.label} to="/shop" search={n.search} className="eyebrow text-muted-foreground transition-colors hover:text-foreground">
              {n.label}
            </Link>
          ))}
          <Link to="/story" className="eyebrow text-muted-foreground transition-colors hover:text-foreground">Our Story</Link>
        </nav>
        <div className="flex items-center gap-4">
          <button aria-label="Search" onClick={() => setSearching((s) => !s)}>
            <Search className="size-5" />
          </button>
          <button aria-label={`Cart, ${count} items`} onClick={() => setOpen(true)} className="relative">
            <ShoppingBag className="size-5" />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
      {searching && (
        <form onSubmit={submit} className="border-t px-5 py-3 md:px-10">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the collection…" aria-label="Search products"
            className="mx-auto block w-full max-w-[1500px] bg-transparent py-2 text-lg outline-none placeholder:text-muted-foreground" />
        </form>
      )}
      {menu && (
        <div className="fixed inset-0 z-50 bg-background lg:hidden">
          <div className="flex h-16 items-center justify-between border-b px-5">
            <Logo />
            <button aria-label="Close menu" onClick={() => setMenu(false)}><X className="size-5" /></button>
          </div>
          <nav className="flex flex-col px-5 py-6" aria-label="Mobile">
            {nav.map((n) => (
              <Link key={n.label} to="/shop" search={n.search} onClick={() => setMenu(false)} className="border-b py-4 font-display text-2xl font-bold uppercase">
                {n.label}
              </Link>
            ))}
            <Link to="/story" onClick={() => setMenu(false)} className="border-b py-4 font-display text-2xl font-bold uppercase">Our Story</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
