import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No special config needed — auth and tRPC requests go directly to
  // localhost:3000 with credentials: "include" (same-site on localhost)
};

export default nextConfig;
