import { SITE_URL } from "@/lib/seo";
import {
  CatalogueUnavailableError,
  listProducts,
  parseListingParams,
} from "@/lib/supabase/catalog";
import type { MetadataRoute } from "next";

/**
 * Sitemap — S-5, T-57.
 *
 * Every public route. NO /admin (and no /admin/*) — the admin is
 * excluded here and disallowed in robots.ts. NO transactional flow
 * pages either (S-6, T-61, S6-10): /bag, /checkout, /orders and
 * /order/confirmation are guest-flow pages that must not be indexed
 * — they are also disallowed in robots.ts and carry noindex metadata.
 * Product pages are added from the live catalogue when it can be
 * read; when it cannot (no env vars in CI, tables not yet created),
 * the sitemap falls back to the static routes only instead of
 * failing the build.
 */
const STATIC_ROUTES: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/sunglasses", changeFrequency: "weekly", priority: 0.9 },
  { path: "/help", changeFrequency: "monthly", priority: 0.7 },
  { path: "/guide/face-shape", changeFrequency: "monthly", priority: 0.7 },
  { path: "/guide/face-shape/bn", changeFrequency: "monthly", priority: 0.7 },
  { path: "/returns", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.4 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const { products } = await listProducts(parseListingParams({}));
    for (const product of products) {
      entries.push({
        url: `${SITE_URL}/product/${product.slug}`,
        lastModified: new Date(product.created_at),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch (error) {
    if (!(error instanceof CatalogueUnavailableError)) {
      throw error;
    }
    // Catalogue unreadable — static routes only, never a build failure.
  }

  return entries;
}
