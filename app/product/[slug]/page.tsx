import CatalogueUnavailable from "@/components/catalogue-unavailable";
import ProductDetailClient from "@/components/product-detail-client";
import {
  CatalogueUnavailableError,
  getProductBySlug,
  isValidSlug,
} from "@/lib/supabase/catalog";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

/**
 * Product detail — S-1 catalogue read-only.
 *
 * Build-safety: the Supabase tables do not exist yet (the SQL runs
 * later in the dashboard), so this route must never fetch at build
 * time. With Cache Components enabled (Next 16), `export const dynamic
 * = "force-dynamic"` is not allowed — the replacement is `connection()`
 * plus `export const instant = false` (the build error's own suggested
 * fix for a blocking route): this page reads its slug at request time,
 * before any shell is sent, so `notFound()` still sets a real HTTP 404
 * for an unknown slug. (`notFound()` inside a streamed Suspense child
 * renders the 404 page but cannot change the already-sent 200 status,
 * so the validity check cannot live behind Suspense.) The data fetch
 * stays behind Suspense and renders the graceful "catalogue
 * unavailable" state on failure, never an error.
 *
 * Unknown or invalid slug -> notFound() (renders app/not-found.tsx,
 * HTTP 404). No totals, no checkout, no bag in S-1 (S-2/S-3).
 */
export const instant = false;

async function ProductContent({ slug }: { slug: string }) {
  let product: Awaited<ReturnType<typeof getProductBySlug>>;
  try {
    product = await getProductBySlug(slug);
  } catch (error) {
    if (error instanceof CatalogueUnavailableError) {
      return <CatalogueUnavailable />;
    }
    throw error;
  }

  if (!product) {
    notFound();
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link
          href="/sunglasses"
          className="text-base font-semibold text-action hover:text-action-hover"
        >
          ← Back to sunglasses
        </Link>
      </nav>
      <ProductDetailClient product={product} />
    </>
  );
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Request time only: no static shell is flushed before this, so
  // notFound() below still sets a real HTTP 404.
  await connection();
  const { slug } = await params;

  if (!isValidSlug(slug)) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 md:px-8">
      <Suspense
        fallback={
          <p className="text-base text-text-secondary">
            Loading product details…
          </p>
        }
      >
        <ProductContent slug={slug} />
      </Suspense>
    </main>
  );
}
