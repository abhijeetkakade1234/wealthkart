import type { NextConfig } from "next";

/**
 * Static export for Cloudflare Pages (ADR 0011): no server, no SSR.
 * Circle routes use `?id=0x…` query params instead of dynamic segments.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@wealthkart/rules"],
};

export default nextConfig;
