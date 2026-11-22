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
