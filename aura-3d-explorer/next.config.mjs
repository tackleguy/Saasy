import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.AURA_BUILD_DIR || ".next",
  poweredByHeader: false,
  // `STATIC_EXPORT=1 npm run build` also emits a static site in /out (host anywhere).
  output: process.env.STATIC_EXPORT ? "export" : undefined,
  transpilePackages: ["three"],
  // Serve portfolio renders as AVIF/WebP at the sizes each card needs.
  images: { formats: ["image/avif", "image/webp"] },
  // A package-lock.json in the home directory would otherwise become the
  // workspace root, so file tracing and Turbopack both stay in this app.
  outputFileTracingRoot: root,
  turbopack: { root },
};
export default nextConfig;
