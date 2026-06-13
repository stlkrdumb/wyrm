import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/agent/:path*",
        destination: "http://localhost:3001/api/agent/:path*",
      },
    ];
  },
};

export default nextConfig;
