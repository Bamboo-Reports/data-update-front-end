import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["googleapis"],
  experimental: {
    // Registers are dynamic, so the client router would otherwise refetch one
    // every time the user tabs back to it. Thirty seconds matches the server's
    // table cache: within that window a switch is instant and shows no staler
    // data than a fresh request would have.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
