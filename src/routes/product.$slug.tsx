import { createFileRoute, notFound } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { formatPrice, getProduct, products } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { SizeTable } from "@/components/size-table";

export const Route = createFileRoute("/product/$slug")({
  loader: ({ params }) => {
    const product = getProduct(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.product;
    const title = p ? `${p.name} — The Conservation Collective` : "Product not found";
    return {
      meta: [
        { title },
        { name: "description", content: p?.description ?? "" },
        { property: "og:title", content: title },
        { property: "og:description", content: p?.description ?? "" },
        { property: "og:type", content: "product" },
      ],
    };
  },
  component: ProductPage,
});

function Details({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b py-4">
      <summary className="eyebrow flex cursor-pointer list-none justify-between">{title}<span className="transition-transform group-open:rotate-45">+</span></summary>
      <div className="pt-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}

function ProductPage() {
  const { product: p } = Route.useLoaderData();
  const { add } = useCart();
  const [colorIdx, setColorIdx] = useState(0);
  const [active, setActive] = useState(0);
  const [size, setSize] = useState(p.sizes.length === 1 ? p.sizes[0]! : "");
  const [qty, setQty] = useState(1);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [err, setErr] = useState(false);

  const pickColor = (i: number) => { setColorIdx(i); setActive(p.colors[i]!.image); };
  const addToCart = () => {
    if (!size) { setErr(true); return; }
    add({ slug: p.slug, color: p.colors[colorIdx]!.name, size, qty });
  };

  return (
    <div key={p.slug}>
      <div className="mx-auto grid max-w-[1500px] gap-8 px-0 md:grid-cols-[1.4fr_1fr] md:gap-14 md:px-10 md:py-10">
        <div className="md:flex md:gap-4">
          <div className="hidden w-20 flex-col gap-3 md:flex">
            {p.images.map((src, i) => (
              <button key={i} onClick={() => setActive(i)} aria-label={`View image ${i + 1}`} className={`border ${active === i ? "border-foreground" : "border-transparent opacity-60"}`}>
                <img src={src} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
          <div
            className="relative flex-1 cursor-zoom-in overflow-hidden bg-card"
            onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
            onMouseLeave={() => setZoom(null)}
          >
            <img src={p.images[active]} alt={`${p.name} — view ${active + 1}`}
              className="aspect-[4/5] w-full object-cover transition-transform duration-200 md:aspect-auto md:h-[78vh]"
              style={zoom ? { transform: "scale(1.8)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
          </div>
          <div className="flex gap-2 overflow-x-auto px-5 pt-3 md:hidden">
            {p.images.map((src, i) => (
              <button key={i} onClick={() => setActive(i)} aria-label={`View image ${i + 1}`} className={`w-16 shrink-0 border ${active === i ? "border-foreground" : "border-transparent opacity-60"}`}>
                <img src={src} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pb-28 md:sticky md:top-24 md:self-start md:px-0 md:pb-0">
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">{p.name}</h1>
          <p className="mt-2 text-lg">{formatPrice(p.price)}</p>

          <p className="eyebrow mt-8">Color — <span className="text-muted-foreground">{p.colors[colorIdx]!.name}</span></p>
          <div className="mt-3 flex gap-3">
            {p.colors.map((c, i) => (
              <button key={c.name} onClick={() => pickColor(i)} aria-label={c.name} aria-pressed={i === colorIdx}
                className={`size-9 rounded-full border-2 p-0.5 ${i === colorIdx ? "border-foreground" : "border-transparent"}`}>
                <span className="block size-full rounded-full border" style={{ backgroundColor: c.swatch }} />
              </button>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <p className="eyebrow">Size</p>
            {p.sizes.length > 1 && <a href="#size-guide" className="text-xs underline underline-offset-4">Size guide</a>}
          </div>
          <div className="mt-3 grid grid-cols-6 gap-2">
            {p.sizes.map((s) => (
              <button key={s} onClick={() => { setSize(s); setErr(false); }} aria-pressed={size === s}
                className={`border py-3 text-sm transition-colors ${p.sizes.length === 1 ? "col-span-3" : ""} ${size === s ? "border-foreground bg-foreground text-background" : "hover:border-foreground"}`}>
                {s}
              </button>
            ))}
          </div>
          {err && <p className="mt-2 text-sm text-destructive">Please choose a size.</p>}

          <div className="mt-8 flex gap-3">
            <div className="flex items-center border">
              <button aria-label="Decrease quantity" className="px-3 py-4" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="size-3" /></button>
              <span className="w-8 text-center text-sm">{qty}</span>
              <button aria-label="Increase quantity" className="px-3 py-4" onClick={() => setQty(qty + 1)}><Plus className="size-3" /></button>
            </div>
            <button onClick={addToCart} className="btn flex-1 bg-primary text-primary-foreground hover:bg-ink">Add to Cart</button>
          </div>

          <p className="mt-8 text-sm leading-relaxed">{p.description}</p>

          <div className="mt-8 border-t">
            <Details title="Materials & Care">Material composition and care instructions will be added once confirmed.</Details>
            <Details title="Shipping & Returns">Shipping rates and return policy will be published before launch.</Details>
            {p.sizes.length > 1 && (
              <div id="size-guide"><Details title="Size Guide"><SizeTable /></Details></div>
            )}
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-[1500px] px-5 py-20 md:px-10">
        <h2 className="mb-8 text-2xl font-black uppercase tracking-tight md:text-3xl">You May Also Like</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
          {products.filter((x) => x.slug !== p.slug).slice(0, 4).map((x) => <ProductCard key={x.slug} product={x} />)}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background p-3 md:hidden">
        <div className="flex-1 text-sm">
          <p className="font-semibold">{formatPrice(p.price * qty)}</p>
          <p className="text-xs text-muted-foreground">{p.colors[colorIdx]!.name}{size ? ` · ${size}` : ""}</p>
        </div>
        <button onClick={addToCart} className="btn bg-primary text-primary-foreground">Add to Cart</button>
      </div>
    </div>
  );
}
