import CatalogueUnavailable from "@/components/catalogue-unavailable";
import ProductCard from "@/components/product-card";
import {
  CatalogueUnavailableError,
  listCategories,
  listProducts,
  parseListingParams,
} from "@/lib/supabase/catalog";
import {
  getProductReviewAggregates,
  type ProductReviewAggregate,
} from "@/lib/supabase/reviews";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

/**
 * Sunglasses listing — S-1 catalogue read-only.
 *
 * Build-safety: the Supabase tables do not exist yet (the SQL runs
 * later in the dashboard), so this route must never fetch at build
 * time. With Cache Components enabled (Next 16), `export const dynamic
 * = "force-dynamic"` is not allowed — the replacement is `connection()`
 * inside the Suspense-wrapped inner component below: the static shell
 * (heading + loading fallback) prerenders at build, and everything
 * after `connection()` runs only at request time. Every read is also
 * wrapped in try/catch — on failure the page renders the graceful
 * "catalogue unavailable" state, never an error.
 *
 * Filters (GET form, no JavaScript needed): search text (name +
 * description), category, sort (Featured / Price low→high / Price
 * high→low / Newest), price range, in-stock-only toggle. "Showing X of
 * Y products", empty state + Reset Filters. No bag/checkout in S-1.
 */

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
] as const;

async function ListingContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Prerendering stops here: the fetch below runs only at request time.
  await connection();
  const params = parseListingParams(await searchParams);

  let categories: Awaited<ReturnType<typeof listCategories>> = [];
  let products: Awaited<ReturnType<typeof listProducts>>["products"] = [];
  let total = 0;
  try {
    [categories, { products, total }] = await Promise.all([
      listCategories(),
      listProducts(params),
    ]);
  } catch (error) {
    if (error instanceof CatalogueUnavailableError) {
      return <CatalogueUnavailable />;
    }
    throw error;
  }

  // S-7: one batch aggregate call for the whole listing (never N+1).
  // A reviews failure never breaks the listing — the cards render
  // without ratings instead.
  let aggregates = new Map<string, ProductReviewAggregate>();
  try {
    aggregates = await getProductReviewAggregates(
      products.map((product) => product.slug),
    );
  } catch {
    aggregates = new Map<string, ProductReviewAggregate>();
  }

  const hasActiveFilters =
    params.search !== "" ||
    params.category !== "" ||
    params.sort !== "featured" ||
    params.priceMin !== undefined ||
    params.priceMax !== undefined ||
    params.inStockOnly;

  return (
    <>
      {/* Filters */}
      <form
        method="get"
        action="/sunglasses"
        className="mt-8 rounded-lg border border-border bg-surface p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-text">
              Search
            </span>
            <input
              type="search"
              name="search"
              defaultValue={params.search}
              placeholder="Search by name or description…"
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-text placeholder:text-text-secondary"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-text">
              Category
            </span>
            <select
              name="category"
              defaultValue={params.category}
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-text"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-text">
              Sort by
            </span>
            <select
              name="sort"
              defaultValue={params.sort}
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-text"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-text">
              Minimum price (৳)
            </span>
            <input
              type="number"
              name="priceMin"
              min={0}
              inputMode="numeric"
              defaultValue={params.priceMin ?? ""}
              placeholder="No minimum"
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-text placeholder:text-text-secondary"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-text">
              Maximum price (৳)
            </span>
            <input
              type="number"
              name="priceMax"
              min={0}
              inputMode="numeric"
              defaultValue={params.priceMax ?? ""}
              placeholder="No maximum"
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-text placeholder:text-text-secondary"
            />
          </label>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 pt-6 text-base text-text">
            <input
              type="checkbox"
              name="inStockOnly"
              value="true"
              defaultChecked={params.inStockOnly}
              className="h-5 w-5 accent-action"
            />
            In stock only
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-md bg-action px-6 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active"
          >
            Apply filters
          </button>
          {hasActiveFilters ? (
            <Link
              href="/sunglasses"
              className="inline-flex h-11 items-center rounded-md border border-border px-6 text-base font-semibold text-text hover:border-action"
            >
              Reset Filters
            </Link>
          ) : null}
        </div>
      </form>

      {/* Count */}
      <p className="mt-8 text-base text-text-secondary" aria-live="polite">
        Showing {products.length} of {total} products
      </p>

      {/* Results */}
      {products.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-text">
            No sunglasses match your filters
          </p>
          <p className="mt-2 text-base text-text-secondary">
            Try a different search, or clear your filters to see everything.
          </p>
          <Link
            href="/sunglasses"
            className="mt-6 inline-flex h-11 items-center rounded-md bg-action px-6 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active"
          >
            Reset Filters
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              reviewAggregate={aggregates.get(product.slug) ?? null}
            />
          ))}
        </ul>
      )}
    </>
  );
}

export default function SunglassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 md:px-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        Sunglasses
      </h1>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-text-secondary">
        Browse our sunglasses. Prices are in Bangladeshi Taka (৳).
      </p>

      <Suspense
        fallback={
          <p className="mt-8 text-base text-text-secondary">
            Loading sunglasses…
          </p>
        }
      >
        <ListingContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
