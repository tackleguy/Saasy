import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { categories, groups, products } from "@/lib/products";
import { ProductCard } from "@/components/product-card";

const schema = z.object({ category: z.string().optional(), q: z.string().optional() });

export const Route = createFileRoute("/shop")({
  validateSearch: schema,
  head: () => ({
    meta: [
      { title: "Shop All — The Conservation Collective" },
      { name: "description", content: "Shop tees, hoodies, caps, sweatpants, adventure pants and rain shells." },
      { property: "og:title", content: "Shop All — The Conservation Collective" },
      { property: "og:description", content: "Elevated outdoor essentials." },
    ],
  }),
  component: Shop,
});

const filters = [
  { slug: undefined, name: "All" },
  ...categories.map((c) => ({ slug: c.slug as string, name: c.name })),
];

function Shop() {
  const { category, q } = Route.useSearch();
  const allowed = category ? groups[category] ?? [category] : null;
  const term = q?.toLowerCase().trim();
  const list = products.filter(
    (p) =>
      (!allowed || allowed.includes(p.category)) &&
      (!term || `${p.name} ${p.category} ${p.colors.map((c) => c.name).join(" ")}`.toLowerCase().includes(term)),
  );
  const title = q ? `Results for “${q}”` : category ? (categories.find((c) => c.slug === category)?.name ?? category) : "Shop All";

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-12 md:px-10 md:py-16">
      <h1 className="text-4xl font-black uppercase tracking-tight md:text-6xl">{title}</h1>
      <div className="-mx-5 mt-8 flex gap-2 overflow-x-auto px-5 pb-2 md:mx-0 md:px-0">
        {filters.map((f) => (
          <Link key={f.name} to="/shop" search={{ category: f.slug }}
            className={`eyebrow shrink-0 border px-4 py-2.5 transition-colors ${category === f.slug && !q ? "border-foreground bg-foreground text-background" : "hover:border-foreground"}`}>
            {f.name}
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">{list.length} {list.length === 1 ? "product" : "products"}</p>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-3">
        {list.map((p) => <ProductCard key={p.slug} product={p} />)}
      </div>
      {list.length === 0 && <p className="py-20 text-center text-muted-foreground">No products match your search.</p>}
    </div>
  );
}
