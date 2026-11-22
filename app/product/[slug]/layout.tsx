import { buildProductJsonLd } from "@/lib/product-schema";
import { SITE_URL } from "@/lib/seo";
import {
  CatalogueUnavailableError,
  getProductBySlug,
  isValidSlug,
} from "@/lib/supabase/catalog";
import type { Metadata } from "next";
import { cache } from "react";

/**
 * Product layout — S-5, T-57: per-product metadata + Product JSON-LD.
 *
 * The page itself (app/product/[slug]/page.tsx) is untouched. The
 * product is fetched once per request (React `cache` dedupes the
 * generateMetadata + layout calls) and only from the real catalogue
 * — name, description, price (BDT integer), and photo all come from
 * the product row, nothing is invented. Unknown slug or unavailable
 * catalogue: no metadata override and no JSON-LD, just the children
 * (the page renders its own 404 / catalogue-unavailable state).
 */
const getProduct = cache(async (slug: string) => {
  if (!isValidSlug(slug)) {
    return null;
  }
  try {
    return await getProductBySlug(slug);
  } catch (error) {
    if (error instanceof CatalogueUnavailableError) {
      return null;
    }
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) {
    return {};
  }
  const description =
    product.description ??
    `${product.name} — sunglasses at RabbY. Prices in Bangladeshi Taka (৳).`;
  const primaryImage =
    product.images.find((image) => image.is_primary) ?? product.images[0];
  return {
    title: product.name,
    description,
    alternates: {
      canonical: `${SITE_URL}/product/${product.slug}`,
    },
    openGraph: {
      title: `${product.name} | RabbY`,
      description,
      url: `${SITE_URL}/product/${product.slug}`,
      siteName: "RabbY",
      type: "website",
      ...(primaryImage
        ? { images: [{ url: primaryImage.storage_path }] }
        : {}),
    },
    twitter: {
      card: primaryImage ? "summary_large_image" : "summary",
      title: `${product.name} | RabbY`,
      description,
      ...(primaryImage ? { images: [primaryImage.storage_path] } : {}),
    },
  };
}

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) {
    return <>{children}</>;
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildProductJsonLd(product)),
        }}
      />
      {children}
    </>
  );
}
