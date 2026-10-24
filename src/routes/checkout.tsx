import { createFileRoute, Link } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { formatPrice, getProduct } from "@/lib/products";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — The Conservation Collective" },
      { name: "description", content: "Review your order." },
      { property: "og:title", content: "Checkout — The Conservation Collective" },
      { property: "og:description", content: "Review your order." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const { items, subtotal } = useCart();
  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-5 py-14 md:grid-cols-2 md:px-10">
      <div>
        <h1 className="text-4xl font-black uppercase tracking-tight">Checkout</h1>
        <div className="mt-8 border border-foreground p-6">
          <p className="eyebrow">Online checkout opening soon</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We're not taking payments online yet. Your cart is saved — join the list below the footer and we'll let you know the moment checkout opens.
          </p>
        </div>
        <Link to="/shop" className="btn mt-6 border hover:border-foreground">Continue Shopping</Link>
      </div>
      <div className="bg-card p-6">
        <p className="eyebrow mb-4">Order Summary</p>
        {items.length === 0 && <p className="text-sm text-muted-foreground">Your cart is empty.</p>}
        {items.map((it, i) => {
          const p = getProduct(it.slug);
          if (!p) return null;
          return (
            <div key={i} className="flex justify-between border-b py-3 text-sm">
              <span>{p.name} <span className="text-muted-foreground">· {it.color} · {it.size} × {it.qty}</span></span>
              <span>{formatPrice(p.price * it.qty)}</span>
            </div>
          );
        })}
        <div className="mt-4 flex justify-between font-semibold"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
      </div>
    </div>
  );
}
