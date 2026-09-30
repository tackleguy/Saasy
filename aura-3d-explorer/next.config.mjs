import { fileURLToPath } from "node:url";
import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `STATIC_EXPORT=1 npm run build` also emits a static site in /out (host anywhere).
  output: process.env.STATIC_EXPORT ? "export" : undefined,
  transpilePackages: ["three"],
  // Pin the workspace root to this folder (avoids picking up lockfiles in parent directories).
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
};
export default nextConfig;
