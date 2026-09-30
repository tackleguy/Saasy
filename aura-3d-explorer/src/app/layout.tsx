import type { Metadata, Viewport } from "next";
// Self-hosted fonts (bundled via npm — no runtime request to Google Fonts)
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "AURA — 3D Explorer & Yield Engine",
  description: "Interactive real-estate development showcase: procedural 3D tower, CAD ingestion and a live spatial yield engine.",
};

export const viewport: Viewport = {
  themeColor: "#090a0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-obsidian font-sans text-white">{children}</body>
    </html>
  );
}
