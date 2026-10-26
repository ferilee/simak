import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wajib untuk Dockerfile multi-tahap (server mandiri tanpa node_modules penuh).
  output: "standalone",
};

export default nextConfig;
