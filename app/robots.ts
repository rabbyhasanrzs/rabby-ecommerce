import { SITE_URL } from "@/lib/seo";
import type { MetadataRoute } from "next";

/**
 * Robots — S-5, T-57.
 *
 * Everything crawlable except /admin (the whole admin area, including
 * /admin/login). The sitemap is listed so crawlers find it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/admin",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
