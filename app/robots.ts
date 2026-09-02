import type { MetadataRoute } from "next";
import { absoluteUrl, getSiteUrl } from "@/src/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/contact", "/legal/privacy", "/legal/terms", "/legal/legal-notice", "/legal/data-deletion", "/privacy", "/terms", "/data-deletion", "/login"],
      disallow: [
        "/api/",
        "/dashboard",
        "/exercises",
        "/history",
        "/programs",
        "/progress",
        "/settings",
        "/watch",
        "/workout",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: getSiteUrl(),
  };
}
