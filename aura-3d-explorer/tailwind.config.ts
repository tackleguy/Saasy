import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: { DEFAULT: "#0b0d11", 800: "#11141a", 700: "#171b23", 600: "#1f2430", 500: "#2a3040" },
        gold: { DEFAULT: "#d4af37", soft: "#e6c865", dim: "#8f7626" },
        mist: "#9aa3b2",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: { gold: "0 0 0 1px rgba(212,175,55,.35), 0 8px 30px -10px rgba(212,175,55,.35)" },
    },
  },
  plugins: [],
};
export default config;
