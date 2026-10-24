import { createFileRoute, Link } from "@tanstack/react-router";
import a from "@/assets/p/t-shirts_03_charcoal-hiking-lifestyle.jpg.asset.json";
import b from "@/assets/p/adventure-pants_03_sandstone_alpine-trail.jpg.asset.json";

export const Route = createFileRoute("/story")({
  head: () => ({
    meta: [
      { title: "Our Story — The Conservation Collective" },
      { name: "description", content: "Why we make clothing for the outside." },
      { property: "og:title", content: "Our Story — The Conservation Collective" },
      { property: "og:description", content: "Why we make clothing for the outside." },
    ],
  }),
  component: Story,
});

function Story() {
  return (
    <div>
      <section className="mx-auto max-w-4xl px-5 py-20 text-center md:py-28">
        <p className="eyebrow text-muted-foreground">Our Story</p>
        <h1 className="mt-4 text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-7xl">Made for the Outside.</h1>
        <p className="mx-auto mt-8 max-w-xl leading-relaxed text-muted-foreground">
          The Conservation Collective started with a simple idea: the clothes you wear on the trail should be the clothes you want to wear everywhere else. Considered essentials, quiet design, and a deep appreciation for wild places.
        </p>
      </section>
      <div className="grid gap-3 px-3 md:grid-cols-2">
        <img src={a.url} alt="Hiking in the mountains" loading="lazy" className="aspect-[4/5] w-full object-cover" />
        <img src={b.url} alt="Alpine trail" loading="lazy" className="aspect-[4/5] w-full object-cover" />
      </div>
      <section className="mx-auto max-w-2xl px-5 py-20 text-center">
        <p className="leading-relaxed text-muted-foreground">Fewer, better pieces. Built for wherever you go.</p>
        <Link to="/shop" className="btn mt-8 bg-primary text-primary-foreground hover:bg-ink">Shop the Collection</Link>
      </section>
    </div>
  );
}
