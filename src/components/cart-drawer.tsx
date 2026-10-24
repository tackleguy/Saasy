import { Link } from "@tanstack/react-router";
import { Minus, Plus, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { formatPrice, getProduct } from "@/lib/products";

export function CartDrawer() {
  const { open, setOpen, items, update, remove, subtotal } = useCart();
  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-overlay transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside role="dialog" aria-label="Shopping cart"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-background transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between border-b px-6 py-5">
          <p className="eyebrow">Your Cart</p>
          <button aria-label="Close cart" onClick={() => setOpen(false)}><X className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6">
          {items.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">Your cart is empty.</p>}
          {items.map((it, i) => {
            const p = getProduct(it.slug);
            if (!p) return null;
            const c = p.colors.find((c) => c.name === it.color);
            return (
              <div key={i} className="flex gap-4 border-b py-5">
                <img src={p.images[c?.image ?? 0]} alt={p.name} className="h-24 w-24 object-cover" loading="lazy" />
                <div className="flex flex-1 flex-col">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <button aria-label="Remove" onClick={() => remove(i)}><X className="size-4 text-muted-foreground" /></button>
                  </div>
                  <p className="text-xs text-muted-foreground">{it.color} · {it.size}</p>
                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex items-center border">
                      <button aria-label="Decrease" className="p-2" onClick={() => update(i, it.qty - 1)}><Minus className="size-3" /></button>
                      <span className="w-6 text-center text-sm">{it.qty}</span>
                      <button aria-label="Increase" className="p-2" onClick={() => update(i, it.qty + 1)}><Plus className="size-3" /></button>
                    </div>
                    <p className="text-sm">{formatPrice(p.price * it.qty)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {items.length > 0 && (
          <div className="border-t px-6 py-6">
            <div className="mb-4 flex justify-between text-sm"><span>Subtotal</span><span className="font-semibold">{formatPrice(subtotal)}</span></div>
            <Link to="/checkout" onClick={() => setOpen(false)} className="btn w-full bg-primary text-primary-foreground hover:bg-ink">Checkout</Link>
          </div>
        )}
      </aside>
    </div>
  );
}
