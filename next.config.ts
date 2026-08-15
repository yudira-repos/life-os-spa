import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone build (server + only the
  // node_modules it actually needs) — what the Dockerfile copies into the
  // runtime image, instead of shipping the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
