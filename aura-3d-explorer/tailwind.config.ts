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
        display: "-0.035em",
        label: "0.08em",
      },
      fontSize: {
        // Editorial display scale — fluid, capped at 6rem.
        "display-xl": ["clamp(3rem, 7.4vw, 6rem)", { lineHeight: "0.94", letterSpacing: "-0.035em" }],
        "display-lg": ["clamp(2.5rem, 5.4vw, 4.5rem)", { lineHeight: "0.98", letterSpacing: "-0.03em" }],
        "display-md": ["clamp(2rem, 3.6vw, 3.25rem)", { lineHeight: "1.02", letterSpacing: "-0.025em" }],
        "display-sm": ["clamp(1.625rem, 2.4vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      maxWidth: {
        site: "1600px",
      },
      transitionTimingFunction: {
        calm: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
