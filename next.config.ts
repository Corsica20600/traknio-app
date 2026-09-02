import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "play.google.com",
        pathname: "/intl/en_us/badges/static/images/badges/en_badge_web_generic.png",
        search: "",
      },
    ],
  },
};

export default nextConfig;
