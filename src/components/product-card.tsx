import { Link } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { formatPrice, type Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  return (
    <div className="group">
      <div className="relative overflow-hidden bg-card">
        <Link to="/product/$slug" params={{ slug: product.slug }}>
          <img src={product.images[0]} alt={product.name} loading="lazy"
            className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
        </Link>
        <button
          onClick={() => add({ slug: product.slug, color: product.colors[0]!.name, size: product.sizes.includes("M") ? "M" : product.sizes[0], qty: 1 })}
          className="btn absolute inset-x-3 bottom-3 bg-background/95 text-foreground opacity-0 transition-opacity hover:bg-ink hover:text-ink-foreground group-hover:opacity-100 max-md:hidden">
          Quick Add
        </button>
      </div>
      <Link to="/product/$slug" params={{ slug: product.slug }} className="mt-4 block">
        <div className="flex justify-between gap-3 text-sm">
          <p className="font-semibold">{product.name}</p>
          <p>{formatPrice(product.price)}</p>
        </div>
        <div className="mt-2 flex gap-1.5">
          {product.colors.map((c) => (
            <span key={c.name} title={c.name} className="size-3 rounded-full border" style={{ backgroundColor: c.swatch }} />
          ))}
        </div>
      </Link>
    </div>
  );
}
