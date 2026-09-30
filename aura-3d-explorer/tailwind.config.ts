import type { Config } from "tailwindcss";

/**
 * AURA design tokens — dark architectural aesthetic.
 * Secondary / muted text and status colours use Tailwind's built-in
 * slate-400 (#94a3b8), slate-500 (#64748b), emerald-500 (#10b981)
 * and rose-500 (#f43f5e), which match the brand spec exactly.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: { DEFAULT: "#090a0f", 900: "#0d0f15", 800: "#12161f", 700: "#1a1f2b", 600: "#252b38" },
        gold: { DEFAULT: "#d4af37", light: "#f3e5ab", dim: "#8f7626" },
        glass: "rgba(18, 22, 31, 0.7)",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        gold: "0 0 0 1px rgba(212,175,55,.35), 0 8px 30px -10px rgba(212,175,55,.4)",
        card: "0 20px 50px -24px rgba(0,0,0,.8)",
      },
    },
  },
  plugins: [],
};
export default config;
