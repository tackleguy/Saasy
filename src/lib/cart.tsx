import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getProduct } from "./products";

export type CartItem = { slug: string; color: string; size: string; qty: number };

type Ctx = {
  items: CartItem[];
  open: boolean;
  setOpen: (o: boolean) => void;
  add: (item: CartItem) => void;
  update: (i: number, qty: number) => void;
  remove: (i: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
};

const CartContext = createContext<Ctx | null>(null);
const KEY = "conservation-collective-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, loaded]);

  const add = (item: CartItem) => {
    setItems((prev) => {
      const i = prev.findIndex((p) => p.slug === item.slug && p.color === item.color && p.size === item.size);
      if (i >= 0) return prev.map((p, j) => (j === i ? { ...p, qty: p.qty + item.qty } : p));
      return [...prev, item];
    });
    setOpen(true);
  };
  const update = (i: number, qty: number) =>
    setItems((prev) => (qty <= 0 ? prev.filter((_, j) => j !== i) : prev.map((p, j) => (j === i ? { ...p, qty } : p))));
  const remove = (i: number) => setItems((prev) => prev.filter((_, j) => j !== i));
  const clear = () => setItems([]);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + (getProduct(i.slug)?.price ?? 0) * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, open, setOpen, add, update, remove, clear, count, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
