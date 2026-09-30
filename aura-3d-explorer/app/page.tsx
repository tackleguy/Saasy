"use client";
/**
 * AURA 3D Explorer & Yield Engine — main page.
 * Left: WebGL viewport (client-only). Right: financial sidebar.
 */
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowUpRight, Box } from "lucide-react";
import { AuraProvider, useAura } from "@/lib/store";
import { fmtMoney } from "@/lib/finance";
import ViewportOverlay from "@/components/three/ViewportOverlay";
import YieldDashboard from "@/components/dashboard/YieldDashboard";
import CadModal from "@/components/dashboard/CadModal";

// Three.js needs `window`, so the canvas is never server-rendered.
const Scene = dynamic(() => import("@/components/three/Scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold/20 border-t-gold" />
    </div>
  ),
});

function Header() {
  const { setCadOpen, yieldResult } = useAura();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-3.5 lg:px-7">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 font-serif text-xl text-gold">A</div>
        <div>
          <h1 className="font-serif text-2xl leading-none tracking-wide text-white">
            AURA <span className="italic text-gold">3D Explorer</span>
          </h1>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.24em] text-mist">Yield Engine · The Meridian Tower · Concept</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden text-right md:block">
          <p className="text-[10px] uppercase tracking-[0.18em] text-mist">Projected GDV</p>
          <p className="font-serif text-xl tabular-nums text-gold">{fmtMoney(yieldResult.grossRevenue)}</p>
        </div>
        <button
          onClick={() => setCadOpen(true)}
          className="flex items-center gap-2 rounded-full border border-gold/50 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold transition hover:bg-gold hover:text-obsidian"
        >
          <Box size={14} /> <span className="hidden sm:inline">Import CAD /</span> Request Demo <ArrowUpRight size={14} />
        </button>
      </div>
    </header>
  );
}

function Shell() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-obsidian">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 3D viewport */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="relative h-[58vh] shrink-0 lg:h-auto lg:flex-1"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(212,175,55,0.07),transparent_60%)]" />
          <Scene />
          <ViewportOverlay />
        </motion.section>

        {/* Financial sidebar */}
        <aside className="aura-scroll min-h-0 flex-1 overflow-y-auto border-white/[0.06] bg-obsidian p-4 lg:w-[440px] lg:flex-none lg:border-l lg:p-5">
          <YieldDashboard />
          <p className="mt-6 pb-2 text-center text-[10px] uppercase tracking-[0.2em] text-mist/50">Illustrative figures only · not investment advice</p>
        </aside>
      </main>
      <CadModal />
    </div>
  );
}

export default function Page() {
  return (
    <AuraProvider>
      <Shell />
    </AuraProvider>
  );
}
