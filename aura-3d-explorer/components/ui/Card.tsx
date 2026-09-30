import clsx from "clsx";
import { ReactNode } from "react";

/** Glassy obsidian panel used across the sidebar */
export default function Card({ title, eyebrow, action, children, className }: { title?: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-2xl border border-white/[0.06] bg-obsidian-800/80 p-5 backdrop-blur", className)}>
      {(title || eyebrow) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/80">{eyebrow}</p>}
            {title && <h3 className="font-serif text-xl text-white">{title}</h3>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
