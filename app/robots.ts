import { SITE_URL } from "@/lib/seo";
import type { MetadataRoute } from "next";

/**
 * Robots — S-5, T-57.
 *
 * Everything crawlable except /admin (the whole admin area, including
 * /admin/login) and the transactional flow pages (S-6, T-61, S6-10):
 * /bag, /checkout, /order and /orders are guest-flow pages that must
 * not be indexed — they are also absent from the sitemap and carry
 * noindex metadata. The sitemap is listed so crawlers find it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/bag", "/checkout", "/order", "/orders"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
