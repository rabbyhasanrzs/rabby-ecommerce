import { SITE_URL } from "@/lib/seo";
import type { ProductDetail } from "@/lib/supabase/catalog";

/**
 * Product JSON-LD (schema.org) for /product/[slug] — S-5, T-57.
 *
 * Built only from the real product row: name, description, primary
 * photo, and the BDT integer price. No data is invented — a product
 * without a photo gets no `image`, and a product without a
 * description gets no `description`.
 */
export function buildProductJsonLd(product: ProductDetail): Record<
  string,
  unknown
> {
  const primaryImage =
    product.images.find((image) => image.is_primary) ?? product.images[0];
  const imageUrl = primaryImage
    ? primaryImage.storage_path.startsWith("http")
      ? primaryImage.storage_path
      : `${SITE_URL}${primaryImage.storage_path}`
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(imageUrl ? { image: imageUrl } : {}),
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/product/${product.slug}`,
      priceCurrency: "BDT",
      // BDT integer Taka, exactly as stored — never a float, never USD.
      price: product.price_bdt,
      availability:
        product.stock_total > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };
}

/**
 * Serialise a product JSON-LD object for injection into a
 * `<script type="application/ld+json">` block (S-6, T-61, finding
 * S6-02). Plain JSON.stringify does NOT escape `</script>`, so a
 * product name/description containing `</script><script>…</script>`
 * would break out of the JSON-LD block and execute in every
 * visitor's browser (stored XSS via an admin-controlled field).
 * Escaping `<`, `>`, `&`, U+2028 and U+2029 as \uXXXX keeps the JSON
 * valid (the escapes decode to the same characters when parsed)
 * while making a breakout impossible — the standard Next.js JSON-LD
 * pattern.
 */
export function serializeProductJsonLd(product: ProductDetail): string {
  return JSON.stringify(buildProductJsonLd(product))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
