import type { Metadata, Viewport } from "next";
// Self-hosted fonts (bundled via npm — no runtime request to Google Fonts)
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-paper font-sans text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
