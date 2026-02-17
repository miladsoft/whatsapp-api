import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["whatsapp-web.js", "puppeteer", "puppeteer-core"],
};

export default nextConfig;
