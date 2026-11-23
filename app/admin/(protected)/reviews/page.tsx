import {
  adminListReviews,
  type AdminReview,
} from "@/app/admin/(protected)/admin-data";
import ReviewModerationButtons from "@/components/admin/review-moderation-buttons";
import { StarsDisplay } from "@/components/star-rating";
import Link from "next/link";
import { connection } from "next/server";

/**
 * Admin Reviews (S-7, T-70) — moderation queue.
 *
 * Pending first, newest first within a status. Each review shows
 * the product, reviewer (name from the order), stars, sub-ratings,
 * body, and the order reference (link to the admin order page).
 * Approve publishes it; Reject hides it — rejected reviews are
 * KEPT, never deleted, and can be approved later.
 *
 * The empty queue is the normal state at launch (no real reviews
 * yet): the page says so plainly, in the admin area only — the
 * storefront never shows an empty-reviews message.
 */

const STATUS_OPTIONS = ["pending", "approved", "rejected"] as const;

const STATUS_LABEL: Record<AdminReview["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function AdminReviewsPageContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const raw = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  const statusFilter =
    flat.status &&
    (STATUS_OPTIONS as readonly string[]).includes(flat.status)
      ? (flat.status as AdminReview["status"])
      : null;

  const reviews = await adminListReviews(statusFilter);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-text">Reviews</h1>
      <p className="mt-1 text-text-secondary">
        {reviews.length} review{reviews.length === 1 ? "" : "s"}
        {statusFilter ? ` — ${STATUS_LABEL[statusFilter].toLowerCase()}` : ""}.
        Pending reviews wait here until you approve them.
      </p>

      <form
        method="get"
        action="/admin/reviews"
        className="mt-6 flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">
            Status
          </span>
          <select
            name="status"
            defaultValue={statusFilter ?? ""}
            className="h-11 rounded-md border border-border bg-background px-3 text-base text-text"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-11 items-end rounded-md bg-action px-6 pb-3 pt-3 text-base font-semibold text-text-inverse hover:bg-action-hover"
        >
          Apply filter
        </button>
      </form>

      {reviews.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-text">No reviews yet</p>
          <p className="mt-2 text-base text-text-secondary">
            Reviews from delivered orders will appear here for approval.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                {review.product_slug ? (
                  <Link
                    href={`/product/${review.product_slug}`}
                    className="text-base font-semibold text-action hover:text-action-hover"
                  >
                    {review.product_name ?? review.product_slug}
                  </Link>
                ) : (
                  <span className="text-base font-semibold text-text">
                    {review.product_name ?? "Unknown product"}
                  </span>
                )}
                <span
                  className={`rounded-full bg-background-subtle px-2.5 py-1 text-sm font-semibold ${
                    review.status === "pending"
                      ? "text-text"
                      : review.status === "approved"
                        ? "text-stock-in"
                        : "text-error"
                  }`}
                >
                  {STATUS_LABEL[review.status]}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <StarsDisplay average={review.rating} />
                <span className="text-sm text-text-secondary">
                  {review.reviewer_name}
                </span>
                <span className="text-sm text-text-secondary">
                  {formatReviewDate(review.created_at)}
                </span>
                <Link
                  href={`/admin/orders/${review.order_reference}`}
                  className="text-sm font-semibold text-action hover:text-action-hover"
                >
                  Order {review.order_reference}
                </Link>
              </div>
              {(review.quality_rating !== null ||
                review.value_rating !== null ||
                review.fit_rating !== null) && (
                <p className="mt-2 text-sm text-text-secondary">
                  {[
                    review.quality_rating !== null
                      ? `Quality ${review.quality_rating}/5`
                      : null,
                    review.value_rating !== null
                      ? `Value ${review.value_rating}/5`
                      : null,
                    review.fit_rating !== null
                      ? `Fit ${review.fit_rating}/5`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="mt-2 text-base leading-relaxed text-text">
                {review.body}
              </p>
              <div className="mt-4">
                <ReviewModerationButtons
                  reviewId={review.id}
                  status={review.status}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AdminReviewsPageContent searchParams={searchParams} />;
}
