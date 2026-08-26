import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preview hosts that proxy this dev server — allow their dev-asset requests.
  allowedDevOrigins: [
    "burke-playstation-raises-literacy.trycloudflare.com",
    "bell-gel-style-tokyo.trycloudflare.com",
    "search-eyes-carb-relates.trycloudflare.com",
    "craft-rob-exchanges-prove.trycloudflare.com",
    "3000-ilj8pmjhodilnqhwwx6bt.e2b.app",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
};

export default nextConfig;
