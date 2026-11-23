import CatalogueUnavailable from "@/components/catalogue-unavailable";
import ProductDetailClient from "@/components/product-detail-client";
import ReviewsSection from "@/components/reviews";
import {
  CatalogueUnavailableError,
  getProductBySlug,
  isValidSlug,
} from "@/lib/supabase/catalog";
import { isValidOrderReference } from "@/lib/supabase/orders";
import {
  emptyReviewAggregate,
  getProductReviews,
} from "@/lib/supabase/reviews";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

/**
 * Product detail — S-1 catalogue read-only, S-7 reviews.
 *
 * Reviews (S-7, T-70): the page fetches the approved-review
 * aggregate alongside the product and renders the reviews section
 * below the buy panel — only when at least one approved review
 * exists, or when the buyer arrived from the track-order invite
 * (?ref=<valid order reference>), which pre-fills the review form.
 * A reviews fetch failure never breaks the page: the section is
 * skipped (or the form still renders from an empty aggregate when
 * ?ref= is present).
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

async function ProductContent({
  slug,
  prefilledReference,
}: {
  slug: string;
  /** A valid order reference from ?ref=… (track-order invite). */
  prefilledReference: string | null;
}) {
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

  // Reviews are additive: a failure here never breaks the product
  // page — the page renders without reviews instead. The only
  // exception is a buyer who arrived to write one (?ref=…): the
  // form still renders, backed by an empty aggregate.
  let aggregate: Awaited<ReturnType<typeof getProductReviews>> | null = null;
  try {
    aggregate = await getProductReviews(slug);
  } catch {
    aggregate = null;
  }
  const effectiveAggregate =
    aggregate ?? (prefilledReference ? emptyReviewAggregate(slug) : null);

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
      <ProductDetailClient product={product} reviewAggregate={aggregate} />
      {effectiveAggregate ? (
        <ReviewsSection
          aggregate={effectiveAggregate}
          productSlug={product.slug}
          productName={product.name}
          prefilledReference={prefilledReference}
        />
      ) : null}
    </>
  );
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Request time only: no static shell is flushed before this, so
  // notFound() below still sets a real HTTP 404.
  await connection();
  const { slug } = await params;

  if (!isValidSlug(slug)) {
    notFound();
  }

  // ?ref=… pre-fills the review form (track-order invite after
  // delivery). Anything that is not a valid reference is ignored —
  // the form is never prefilled with untrusted input.
  const rawRef = (await searchParams).ref;
  const refValue = Array.isArray(rawRef) ? rawRef[0] : rawRef;
  const prefilledReference =
    refValue !== undefined && isValidOrderReference(refValue)
      ? refValue.trim()
      : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 md:px-8">
      <Suspense
        fallback={
          <p className="text-base text-text-secondary">
            Loading product details…
          </p>
        }
      >
        <ProductContent slug={slug} prefilledReference={prefilledReference} />
      </Suspense>
    </main>
  );
}
