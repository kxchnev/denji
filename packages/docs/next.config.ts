import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so the docs can be hosted anywhere and embedded as an iframe.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
