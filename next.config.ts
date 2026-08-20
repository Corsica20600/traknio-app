import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid Next's runtime image optimizer.  The optimizer loads Next's bundled
  // native sharp module, which is currently failing to load in this Vercel
  // runtime and prevents otherwise unrelated pages (including /settings)
  // from rendering.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
