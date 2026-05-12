import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // Allow LAN/IPv6/ngrok access in dev without the cross-origin warning.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
    "[::1]",
    "localhost",
    // add your IPv6 prefix or LAN host here if you also want LAN access
  ],
};

export default config;
