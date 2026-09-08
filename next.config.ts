import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // sharp loads its native binary and libvips at runtime. Keep both packages
    // in the photo Function, including libraries missed by automatic tracing.
    "/api/evolution/photos": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/sharp-*/**/*",
    ],
  },
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
