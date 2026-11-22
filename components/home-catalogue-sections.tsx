import ProductCard from "@/components/product-card";
import {
  CatalogueUnavailableError,
  listCategories,
  listProducts,
  parseListingParams,
} from "@/lib/supabase/catalog";
import Link from "next/link";
import { connection } from "next/server";

/**
 * Home catalogue sections (S-5, Slice B) — Shop by category + New
 * arrivals, from the live catalogue, never invented.
 *
 * New arrivals use the SAME definition as the listing's "Newest"
 * sort (sortProducts "newest" = created_at descending): the newest
 * 4 active products. The "View all new arrivals" link goes to
 * /sunglasses?sort=newest, which is the listing parameter that
 * actually applies that sort.
 *
 * Build-safety (same pattern as app/sunglasses/page.tsx): `connection()`
 * stops prerendering here, so the Supabase reads run only at request
 * time. On a catalogue failure the sections render a plain-words
 * note — the hero, teasers, and trust strip above still render.
 */

const NEW_ARRIVALS_COUNT = 4;

async function loadCatalogueSections() {
  // Prerendering stops here: the fetches below run only at request time.
  await connection();
  const [categories, { products }] = await Promise.all([
    listCategories(),
    listProducts(parseListingParams({ sort: "newest" })),
  ]);
  return { categories, newArrivals: products.slice(0, NEW_ARRIVALS_COUNT) };
}

export default async function HomeCatalogueSections() {
  let categories: Awaited<ReturnType<typeof listCategories>> = [];
  let newArrivals: Awaited<
    ReturnType<typeof listProducts>
  >["products"] = [];
  try {
    ({ categories, newArrivals } = await loadCatalogueSections());
  } catch (error) {
    if (error instanceof CatalogueUnavailableError) {
      return (
        <section
          aria-label="New arrivals"
          className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8"
        >
          <h2 className="font-display text-2xl font-bold tracking-tight text-text md:text-3xl">
            New arrivals
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-text-secondary">
            New arrivals could not be loaded right now. Please try again
            later.
          </p>
        </section>
      );
    }
    throw error;
  }

  return (
    <>
      {/* Shop by category — the catalogue's real categories only. */}
      {categories.length > 0 ? (
        <section
          aria-label="Shop by category"
          className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8"
        >
          <h2 className="font-display text-2xl font-bold tracking-tight text-text md:text-3xl">
            Shop by category
          </h2>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/sunglasses?category=${category.slug}`}
                  className="group flex min-h-24 items-center justify-between gap-4 rounded-lg border border-border bg-surface px-6 py-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
                >
                  <span className="font-display text-xl font-bold text-text group-hover:text-action">
                    {category.name}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-lg font-semibold text-text-secondary transition-colors group-hover:text-action"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* New arrivals — newest first, same definition as the listing. */}
      <section
        aria-label="New arrivals"
        className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-bold tracking-tight text-text md:text-3xl">
            New arrivals
          </h2>
          <Link
            href="/sunglasses?sort=newest"
            className="text-base font-semibold text-action hover:underline"
          >
            View all new arrivals
          </Link>
        </div>
        {newArrivals.length === 0 ? (
          <p className="mt-6 text-base leading-relaxed text-text-secondary">
            No new arrivals right now. Browse the full range instead.
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {newArrivals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
