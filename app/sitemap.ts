import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/src/lib/site-url";

const publicRoutes = [
  { path: "/", priority: 1 },
  { path: "/contact", priority: 0.6 },
  { path: "/legal/privacy", priority: 0.7 },
  { path: "/legal/terms", priority: 0.7 },
  { path: "/legal/legal-notice", priority: 0.6 },
  { path: "/legal/data-deletion", priority: 0.7 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-07-27T00:00:00+02:00");

  return publicRoutes.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: "monthly",
    priority: route.priority,
  }));
}
