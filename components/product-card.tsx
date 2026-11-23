import { StarIcon } from "@/components/icons";
import ProductImage from "@/components/product-image";
import WishlistButton from "@/components/wishlist-button";
import { formatPriceBdt, stockLabel } from "@/lib/format";
import type { ProductSummary } from "@/lib/supabase/catalog";
import type { ProductReviewAggregate } from "@/lib/supabase/reviews";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Product card — listing grid. Shows the primary image (or the
 * "Photo coming soon" placeholder), name, integer BDT price, and stock
 * in plain words. Out-of-stock cards show "Out of Stock" and no
 * add-to-bag control — S-1 has no bag/checkout (S-2).
 *
 * Polish (S-5, prototype parity): subtle shadow + hover lift, with a
 * very slight image scale on hover (§6.1 — hover never hides the
 * name, price, or stock). Focus is visible via the focus-within ring
 * on the card plus the global :focus-visible outline on the link.
 * Deviation recorded in the S-5 PR: Phase 06A §1.4 says cards are
 * separated "not by shadows"; the owner-approved prototype has subtle
 * card shadows, and the standing instruction is prototype parity.
 *
 * Wishlist heart (S-7): the heart toggle is a SIBLING of the card
 * link, positioned over the top-right of the image — NEVER nested
 * inside the <a>. A <button> inside a <Link> is invalid HTML and a
 * keyboard/screen-reader problem: activating the heart must never
 * navigate. The card is position-relative so the absolute heart sits
 * over the image.
 */
export default function ProductCard({
  product,
  reviewAggregate,
  footer,
}: {
  product: ProductSummary;
  /** Batch aggregate from the listing page, or null when unavailable. */
  reviewAggregate?: ProductReviewAggregate | null;
  /**
   * Optional actions rendered below the card link, inside the card
   * (the /wishlist page passes "Choose options" + Remove here).
   */
  footer?: ReactNode;
}) {
  const outOfStock = product.stock_total <= 0;
  return (
    <li className="group relative overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-within:shadow-md focus-within:ring-2 focus-within:ring-focus">
      <Link href={`/product/${product.slug}`} className="block">
        <ProductImage
          src={product.primary_image}
          alt={product.name}
          className="aspect-[4/3] w-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
        />
        <span className="block px-4 pt-4">
          <span className="block font-display text-lg font-bold leading-snug text-text">
            {product.name}
          </span>
          {product.category_name ? (
            <span className="mt-1 block text-sm text-text-secondary">
              {product.category_name}
            </span>
          ) : null}
          <span className="mt-2 block text-base font-semibold text-text">
            {formatPriceBdt(product.price_bdt)}
          </span>
          {/* S-7: aggregate rating — only once real approved reviews
              exist (no "0.0", no rating without reviews, D-8). */}
          {reviewAggregate !== null &&
          reviewAggregate !== undefined &&
          reviewAggregate.reviewCount > 0 &&
          reviewAggregate.averageRating !== null ? (
            <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-text">
              <StarIcon filled className="h-4 w-4 text-warning" />
              <span>
                {reviewAggregate.averageRating.toFixed(1)} (
                {reviewAggregate.reviewCount})
              </span>
              <span className="sr-only">
                out of 5 stars, based on {reviewAggregate.reviewCount} review
                {reviewAggregate.reviewCount === 1 ? "" : "s"}
              </span>
            </span>
          ) : null}
          <span
            className={`mt-1 block pb-4 text-sm font-semibold ${
              outOfStock ? "text-error" : "text-stock-in"
            }`}
          >
            {stockLabel(product.stock_total)}
          </span>
        </span>
      </Link>
      {/* S-7: heart as a SIBLING of the link, over the image — a
          button must never be nested inside the card's <a>. */}
      <WishlistButton
        slug={product.slug}
        productName={product.name}
        variant="card"
        className="absolute right-3 top-3"
      />
      {footer ? (
        <div className="border-t border-border px-4 py-3">{footer}</div>
      ) : null}
    </li>
  );
}
