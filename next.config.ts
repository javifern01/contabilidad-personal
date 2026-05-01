import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Phase 1: no experimental flags. Phase 4 may enable serverActions allowedOrigins for PSD2 callback.
};

export default nextConfig;
