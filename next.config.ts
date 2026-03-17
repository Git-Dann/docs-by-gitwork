import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next-local",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
