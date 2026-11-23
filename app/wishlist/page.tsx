"use client";

import CatalogueUnavailable from "@/components/catalogue-unavailable";
import ProductCard from "@/components/product-card";
import {
  listProducts,
  parseListingParams,
  type ProductSummary,
} from "@/lib/supabase/catalog";
import { useWishlist } from "@/lib/wishlist-context";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Wishlist page (S-7, 1.x-3).
 *
 * Saved slugs come from the wishlist (browser localStorage — this
 * device and browser only, said in plain words below the heading).
 * Live product data is re-fetched on every visit with ONE batched
 * listProducts read, then filtered to the saved slugs in save order
 * — no per-card waterfall, and never a snapshot price: what the
 * page shows is the current price and stock.
 *
 * - A saved slug whose product is inactive or deleted is not in
 *   the active catalogue, so it drops from the list silently.
 * - An out-of-stock saved item stays visible with "Out of Stock"
 *   and NO way to add it to the bag: no "Choose options" action.
 *   (The card itself still links to the PDP for viewing.)
 * - "Choose options" sends the customer to the PDP to pick a
 *   colour: a wishlist entry is just a slug, and silently adding
 *   the first colour to the bag would choose for the customer.
 * - Remove is the heart toggle on the card, plus an explicit
 *   Remove button under each item. The footer button carries no
 *   aria-label on purpose: the card heart already has the full
 *   "Remove <name> from wishlist" label, and two identical labels
 *   would be ambiguous.
 * - A fetch failure renders the shared "catalogue unavailable"
 *   state, never an error — same as the listing page.
 */
export default function WishlistPage() {
  const { slugs, count, loaded, toggle } = useWishlist();
  // Last successful batched catalogue read (all active products),
  // or null while it is still loading / before the first fetch.
  const [fetched, setFetched] = useState<ProductSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  // One batched read, once the saved list is known and non-empty.
  // Async setState inside the fetch (same pattern as
  // components/announcement-banner.tsx) — never a synchronous
  // setState in this effect.
  useEffect(() => {
    if (!loaded || slugs.length === 0 || fetched !== null || failed) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { products } = await listProducts(parseListingParams({}));
        if (!cancelled) {
          setFetched(products);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, slugs.length, fetched, failed]);

  // Live products for the saved slugs, in save order. A slug with
  // no live product (deleted / inactive) drops out here.
  const visible: ProductSummary[] =
    fetched === null
      ? []
      : slugs.flatMap((slug) => {
          const product = fetched.find((p) => p.slug === slug);
          return product ? [product] : [];
        });

  // CatalogueUnavailable renders its own <main> — return it alone
  // rather than nesting it inside this page's <main>.
  if (failed) {
    return <CatalogueUnavailable />;
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 md:px-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        Wishlist
      </h1>
      <p className="mt-2 text-base text-text-secondary">
        Saved on this device and browser.
      </p>

      {!loaded || (slugs.length > 0 && fetched === null) ? (
        <p className="mt-8 text-base text-text-secondary" aria-live="polite">
          Loading your wishlist…
        </p>
      ) : slugs.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-text">
            Your wishlist is empty.
          </p>
          <p className="mt-2 text-base text-text-secondary">
            Save sunglasses you like with the heart, and they will be
            waiting for you here.
          </p>
          <Link
            href="/sunglasses"
            className="mt-6 inline-flex h-11 items-center rounded-md bg-action px-6 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active"
          >
            Browse sunglasses
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-text">
            The products you saved are no longer available.
          </p>
          <p className="mt-2 text-base text-text-secondary">
            They may have been removed from the catalogue.
          </p>
          <Link
            href="/sunglasses"
            className="mt-6 inline-flex h-11 items-center rounded-md bg-action px-6 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active"
          >
            Browse sunglasses
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-8 text-base text-text-secondary" aria-live="polite">
            {count} saved {count === 1 ? "product" : "products"}
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((product) => {
              const outOfStock = product.stock_total <= 0;
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  footer={
                    <span className="flex flex-wrap items-center gap-3">
                      {outOfStock ? null : (
                        <Link
                          href={`/product/${product.slug}`}
                          className="inline-flex min-h-11 items-center rounded-md bg-action px-4 text-base font-semibold text-text-inverse hover:bg-action-hover"
                        >
                          Choose options
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => toggle(product.slug)}
                        className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-4 text-base font-semibold text-text hover:border-action"
                      >
                        Remove
                      </button>
                    </span>
                  }
                />
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
