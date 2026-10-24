import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { categories, products } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { Newsletter } from "@/components/newsletter";
import hero from "@/assets/p/hoodies_04_gray-backpack-trail.jpg.asset.json";
import lifestyle from "@/assets/p/rain-jackets_02_black_alpine-rain-shell.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Conservation Collective — Made for the Outside" },
      { name: "description", content: "Elevated outdoor essentials built for wherever you go. Tees, hoodies, caps, pants and rain shells." },
      { property: "og:title", content: "The Conservation Collective — Made for the Outside" },
      { property: "og:description", content: "Elevated outdoor essentials built for wherever you go." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      <section className="relative h-[88svh] min-h-[540px] overflow-hidden bg-ink text-ink-foreground">
        <img src={hero.url} alt="Hiker in a heavyweight hoodie on a mountain trail" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
        <div className="relative mx-auto flex h-full max-w-[1500px] flex-col justify-end px-5 pb-14 md:px-10 md:pb-20">
          <h1 className="fade-up max-w-4xl text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-8xl">Made for the Outside.</h1>
          <p className="fade-up mt-5 max-w-md text-base opacity-85 [animation-delay:150ms] md:text-lg">Elevated essentials. Built for wherever you go.</p>
          <div className="fade-up mt-8 flex flex-col gap-3 [animation-delay:300ms] sm:flex-row">
            <Link to="/shop" className="btn bg-ink-foreground text-ink hover:bg-accent">Shop the Collection</Link>
            <Link to="/story" className="btn border border-ink-foreground/70 hover:bg-ink-foreground hover:text-ink">Explore the Brand</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] px-5 py-20 md:px-10 md:py-28">
        <div className="mb-10 flex items-end justify-between">
          <h2 className="text-3xl font-black uppercase tracking-tight md:text-5xl">Shop by Category</h2>
          <Link to="/shop" className="eyebrow hidden items-center gap-2 md:flex">View All <ArrowRight className="size-4" /></Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {categories.map((c) => (
            <Link key={c.slug} to="/shop" search={{ category: c.slug }} className="group relative overflow-hidden bg-card">
              <img src={c.image} alt={c.name} loading="lazy" className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
              <span className="absolute bottom-4 left-4 font-display text-lg font-extrabold uppercase text-ink-foreground md:bottom-6 md:left-6 md:text-2xl">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t bg-card/40">
        <div className="mx-auto max-w-[1500px] px-5 py-20 md:px-10 md:py-28">
          <p className="eyebrow text-muted-foreground">The Essentials</p>
          <h2 className="mb-10 mt-2 text-3xl font-black uppercase tracking-tight md:text-5xl">Featured Collection</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-3">
            {products.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-ink text-ink-foreground">
        <img src={lifestyle.url} alt="Alpine landscape" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="relative mx-auto max-w-[1500px] px-5 py-32 md:px-10 md:py-48">
          <h2 className="text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-8xl">Built to Explore.</h2>
          <p className="mt-6 max-w-lg opacity-85">Clothing for long trails and slow mornings. Designed for everyday comfort, made with respect for the places that inspire us.</p>
          <Link to="/story" className="btn mt-8 border border-ink-foreground/70 hover:bg-ink-foreground hover:text-ink">Our Story</Link>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-5 py-24 text-center md:py-32">
        <h2 className="text-3xl font-black uppercase tracking-tight md:text-5xl">Join the Collective.</h2>
        <div className="mt-6 text-left"><Newsletter /></div>
      </section>
    </>
  );
}
