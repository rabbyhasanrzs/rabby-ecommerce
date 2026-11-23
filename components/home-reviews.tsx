import { StarsDisplay } from "@/components/star-rating";
import {
  HOME_REVIEWS_COUNT,
  firstName,
  getRecentApprovedReviews,
  type RecentReview,
} from "@/lib/supabase/reviews";
import Link from "next/link";
import { connection } from "next/server";

/**
 * Home reviews section — S-7 (home-page reviews, after PR #40).
 *
 * Async server component, rendered behind Suspense on the home page
 * (same pattern as HomeCatalogueSections): `connection()` stops
 * prerendering here, so the Supabase read runs only at request time.
 *
 * One batched call — get_recent_approved_reviews (migration 0011)
 * returns the newest approved reviews across all products, newest
 * first, with the product slug + name for the PDP link. No N+1.
 *
 * Absence-first (D-8, same rule as the PDP reviews): the section
 * renders NOTHING — no heading, no "No reviews yet" — until the
 * first approved review exists. A fetch failure also renders
 * nothing; reviews are additive and must never break the home page.
 *
 * Each card: star rating, the review text, the product name linked
 * to its PDP, and the reviewer's FIRST name only (never the full
 * order name) with a "Verified Buyer" badge — every displayed
 * review traces to a delivered order (migration 0010).
 */
export function HomeReviewsList({ reviews }: { reviews: RecentReview[] }) {
  return (
    <section
      aria-label="What our customers say"
      className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8"
    >
      <h2 className="font-display text-2xl font-bold tracking-tight text-text md:text-3xl">
        What our customers say
      </h2>
      <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {reviews.map((review) => (
          <li
            key={`${review.productSlug}-${review.createdAt}`}
            className="flex flex-col rounded-lg border border-border bg-surface p-6 shadow-sm"
          >
            <article className="flex flex-1 flex-col">
              <StarsDisplay average={review.rating} />
              <p className="mt-4 flex-1 text-base leading-relaxed text-text">
                {review.body}
              </p>
              <footer className="mt-6 border-t border-border pt-4">
                <p>
                  <Link
                    href={`/product/${review.productSlug}`}
                    className="text-base font-semibold text-action hover:underline"
                  >
                    {review.productName}
                  </Link>
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-text">
                    {firstName(review.reviewerName)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-background-subtle px-2 py-0.5 text-xs font-semibold text-text-secondary">
                    Verified Buyer
                  </span>
                </p>
              </footer>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function HomeReviews() {
  // Prerendering stops here: the fetch below runs only at request time.
  await connection();
  let reviews: RecentReview[];
  try {
    reviews = await getRecentApprovedReviews(HOME_REVIEWS_COUNT);
  } catch {
    // Reviews are additive: a failure renders nothing, never an error.
    return null;
  }
  if (reviews.length === 0) {
    return null;
  }
  return <HomeReviewsList reviews={reviews} />;
}
