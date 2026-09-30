import type { Metadata } from "next";
// Self-hosted fonts (bundled via npm — no runtime call to Google Fonts)
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "AURA — 3D Explorer & Yield Engine",
  description: "Interactive real-estate development showcase with live 3D massing and yield modelling.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
