import ProductCard from "@/components/product-card";
import type { ProductSummary } from "@/lib/supabase/catalog";
import type { ProductReviewAggregate } from "@/lib/supabase/reviews";
import Link from "next/link";

/**
 * "You May Also Like" — S-7 cross-sell (F13, 1.x-2), PDP section 7:
 * after Reviews, before the footer (IA line 360).
 *
 * Server component: the PDP fetches the related products (same-category
 * first, fill to 4 — see getRelatedProducts) plus one batch aggregate
 * call for the row, and passes both in. Renders NOTHING when the list
 * is empty (a one-product catalogue has nothing honest to suggest).
 * The heading is a suggestion, never a claim: at 8 demo products the
 * row is "other products", not curation — no copy says "similar" or
 * "customers also bought". Cards are the full listing ProductCard,
 * link-only (no quick Add to Bag in v1); out-of-stock cards keep
 * their existing disabled state.
 */
export default function RelatedProducts({
  products,
  aggregates,
}: {
  products: ProductSummary[];
  /** Batch aggregates keyed by slug (one call for the whole row, never N+1). */
  aggregates: Map<string, ProductReviewAggregate>;
}) {
  if (products.length === 0) {
    return null;
  }
  return (
    <section aria-label="You May Also Like" className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-bold tracking-tight text-text">
          You May Also Like
        </h2>
        <Link
          href="/sunglasses"
          className="text-base font-semibold text-action hover:text-action-hover"
        >
          View All →
        </Link>
      </div>
      <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            reviewAggregate={aggregates.get(product.slug) ?? null}
          />
        ))}
      </ul>
    </section>
  );
}
