/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allows `npm run build` to also emit a static site in /out (easy hosting anywhere).
  output: process.env.STATIC_EXPORT ? "export" : undefined,
  transpilePackages: ["three"],
};
export default nextConfig;
