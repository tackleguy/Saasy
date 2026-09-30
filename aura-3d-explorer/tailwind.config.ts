import type { Config } from "tailwindcss";

/**
 * AURA design tokens — warm architectural palette.
 * Colours are CSS variables holding RGB triplets (see globals.css) so they
 * support Tailwind opacity modifiers (`bg-ink/80`) and a dark variant via
 * `data-theme="dark"` without touching components.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: token("paper"), // page background
        stone: token("stone"), // panels
        plaster: token("plaster"), // borders & dividers
        ink: token("ink"), // primary text
        ash: token("ash"), // captions & secondary text
        oak: token("oak"), // warm accent
        sage: token("sage"), // secondary accent
        brass: token("brass"), // highlights only
        positive: token("positive"),
        negative: token("negative"),
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        caption: "-0.005em",
      },
      transitionTimingFunction: {
        calm: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
