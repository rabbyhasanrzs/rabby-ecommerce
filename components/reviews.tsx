import ReviewForm from "@/components/review-form";
import { StarsDisplay } from "@/components/star-rating";
import type { ReviewAggregate } from "@/lib/supabase/reviews";

/**
 * Reviews section — S-7, T-70 (reviews).
 *
 * Server component: the PDP passes it the aggregate fetched from
 * get_product_reviews (migration 0010). It renders NOTHING when
 * there are no approved reviews and the buyer did not arrive from
 * a track-order invite — the empty state is the honest state (no
 * "0.0", no "No reviews yet", no invented rating, D-8).
 *
 * With approved reviews: the F12 display set — average + count,
 * 5→1 breakdown bars, Quality / Value / Fit averages, and the
 * approved review list (name, stars, sub-ratings, body, date —
 * never a phone, email, or order reference). The submit form sits
 * below the list; it opens expanded when the buyer arrived with a
 * prefilled reference (?ref=…), otherwise behind a button.
 */

const SUB_RATINGS = [
  { key: "qualityAverage", label: "Quality" },
  { key: "valueAverage", label: "Value" },
  { key: "fitAverage", label: "Fit" },
] as const;

function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ReviewsSection({
  aggregate,
  productSlug,
  productName,
  prefilledReference,
}: {
  aggregate: ReviewAggregate;
  productSlug: string;
  productName: string;
  prefilledReference: string | null;
}) {
  const hasReviews = aggregate.reviewCount > 0;
  // The empty-state rule, enforced here as well as on the PDP:
  // nothing review-related renders until a real approved review
  // exists — unless the buyer arrived to write one.
  if (!hasReviews && !prefilledReference) {
    return null;
  }

  return (
    <section id="reviews" aria-label="Customer reviews" className="mt-12">
      <h2 className="font-display text-2xl font-bold tracking-tight text-text">
        Reviews
      </h2>

      {hasReviews && aggregate.averageRating !== null ? (
        <div className="mt-6 grid gap-8 md:grid-cols-[auto_1fr]">
          {/* Aggregate */}
          <div>
            <p className="flex items-end gap-2">
              <span className="font-display text-5xl font-bold text-text">
                {aggregate.averageRating.toFixed(1)}
              </span>
              <span className="pb-1 text-base text-text-secondary">
                out of 5
              </span>
            </p>
            <p className="mt-2">
              <StarsDisplay
                average={aggregate.averageRating}
                count={aggregate.reviewCount}
              />
            </p>
            <p className="mt-2 text-base text-text-secondary">
              Based on {aggregate.reviewCount} review
              {aggregate.reviewCount === 1 ? "" : "s"}
            </p>
          </div>

          {/* Breakdown + sub-ratings */}
          <div className="space-y-6">
            <ul className="space-y-2" aria-label="Rating breakdown">
              {(["5", "4", "3", "2", "1"] as const).map((star) => {
                const count = aggregate.breakdown[star];
                const percent =
                  aggregate.reviewCount === 0
                    ? 0
                    : Math.round((count / aggregate.reviewCount) * 100);
                return (
                  <li key={star} className="flex items-center gap-3 text-base">
                    <span className="w-12 shrink-0 text-text-secondary">
                      {star} star{star === "1" ? "" : "s"}
                    </span>
                    <span
                      className="h-2.5 flex-1 overflow-hidden rounded-full bg-background-subtle"
                      role="img"
                      aria-label={`${count} out of ${aggregate.reviewCount} reviews gave ${star} star${star === "1" ? "" : "s"}`}
                    >
                      <span
                        className="block h-full rounded-full bg-warning"
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right text-text-secondary">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
            <dl className="grid gap-2 sm:grid-cols-3">
              {SUB_RATINGS.map(({ key, label }) => {
                const average = aggregate[key];
                if (average === null) {
                  return null;
                }
                return (
                  <div
                    key={key}
                    className="rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <dt className="text-sm text-text-secondary">{label}</dt>
                    <dd className="mt-1 flex items-center gap-2">
                      <StarsDisplay average={average} />
                      <span className="text-base font-semibold text-text">
                        {average.toFixed(1)}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      ) : null}

      {/* Approved review list */}
      {hasReviews ? (
        <ul className="mt-8 space-y-6">
          {aggregate.reviews.map((review, index) => (
            <li
              key={`${review.reviewerName}-${review.createdAt}-${index}`}
              className="border-t border-border pt-6"
            >
              <article>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-base font-semibold text-text">
                    {review.reviewerName}
                  </p>
                  <StarsDisplay average={review.rating} />
                  <p className="text-sm text-text-secondary">
                    {formatReviewDate(review.createdAt)}
                  </p>
                </div>
                {(review.qualityRating !== null ||
                  review.valueRating !== null ||
                  review.fitRating !== null) && (
                  <p className="mt-2 text-sm text-text-secondary">
                    {[
                      review.qualityRating !== null
                        ? `Quality ${review.qualityRating}/5`
                        : null,
                      review.valueRating !== null
                        ? `Value ${review.valueRating}/5`
                        : null,
                      review.fitRating !== null
                        ? `Fit ${review.fitRating}/5`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <p className="mt-2 text-base leading-relaxed text-text">
                  {review.body}
                </p>
              </article>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Submit form */}
      <div className="mt-8">
        <ReviewForm
          productSlug={productSlug}
          productName={productName}
          prefilledReference={prefilledReference}
          defaultOpen={prefilledReference !== null}
        />
      </div>
    </section>
  );
}
