import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import localFont from "next/font/local";
const serif = localFont({
  src: [
    { path: "../../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-aura-serif", adjustFontFallback: "Times New Roman", display: "swap",
});
const sans = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-aura-sans", weight: "100 900", display: "swap",
});
import "./globals.css";
import Providers from "@/components/site/Providers";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "AURA — Visualise, underwrite and sell developments", template: "%s · AURA" },
  description: "AURA is the platform real estate developers use to market, explore and underwrite projects: live 3D, stacking plans and a developer-grade yield engine.",
  openGraph: { siteName: "AURA", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#F6F4EF",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.STATIC_EXPORT) await connection();
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="flex min-h-dvh flex-col bg-paper font-sans text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
