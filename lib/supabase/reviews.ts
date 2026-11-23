import { getSupabaseClient } from "@/lib/supabase/client";
import { SupabaseNotConfiguredError } from "@/lib/supabase/orders";

/**
 * Reviews data layer — S-7, T-70 (second 1.x feature).
 *
 * The reviews table has NO anon policy (admin-only RLS, migration
 * 0010) — the storefront never selects it directly. Public reads and
 * the submit path go through SECURITY DEFINER functions, the same
 * pattern as validate_discount_code (0009) and create_guest_order:
 *
 *   get_product_reviews(p_slug)        -> approved reviews + aggregate
 *   get_product_review_aggregates(...) -> batch aggregates for cards
 *   submit_review(...)                 -> verified-buyer submit
 *
 * The phone is proof, never content: submit_review compares it
 * server-side and never returns it, and get_product_reviews never
 * returns a phone, email, or order reference — only the reviewer
 * name (from the order), ratings, body, and date.
 *
 * Reviews are ADDITIVE: a failure here must never break the page
 * that shows them. Callers (PDP, listing) catch every error from
 * these helpers and render without reviews instead.
 */

// ---------------------------------------------------------------------------
// Types (match the migration 0010 function contracts exactly)
// ---------------------------------------------------------------------------

/** How many approved reviews the home page shows (migration 0011). */
export const HOME_REVIEWS_COUNT = 3;

/** One approved review, as the public may see it. */
export interface PublicReview {
  reviewerName: string;
  rating: number;
  qualityRating: number | null;
  valueRating: number | null;
  fitRating: number | null;
  body: string;
  createdAt: string;
}

/** Star-count breakdown, keys "5".."1". Sums to reviewCount. */
export type ReviewBreakdown = Record<"5" | "4" | "3" | "2" | "1", number>;

/** Full aggregate for one product (PDP). */
export interface ReviewAggregate {
  productSlug: string;
  reviewCount: number;
  /** One-decimal display average, or null when there are no reviews. */
  averageRating: number | null;
  breakdown: ReviewBreakdown;
  qualityAverage: number | null;
  valueAverage: number | null;
  fitAverage: number | null;
  /** Most recent approved reviews first, capped at 50 by the function. */
  reviews: PublicReview[];
}

/** Slim aggregate for listing cards. */
export interface ProductReviewAggregate {
  productSlug: string;
  reviewCount: number;
  averageRating: number | null;
}

/** One approved review for the home page, with its product. */
export interface RecentReview {
  productSlug: string;
  productName: string;
  reviewerName: string;
  rating: number;
  body: string;
  createdAt: string;
}

/**
 * First name only for display (the home page shows "Rahim", never
 * the full order name — the reviewer is a private customer, not a
 * public profile). Pure (unit-tested). A blank name falls back to
 * "Customer" so the card never renders an empty author line.
 */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first === "" ? "Customer" : first;
}

/**
 * Parse the get_recent_approved_reviews rows into typed reviews.
 * Returns null on a malformed payload — a broken contract is a
 * "no reviews" render, never a crash. Pure (unit-tested).
 */
export function parseRecentReviews(value: unknown): RecentReview[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const reviews: RecentReview[] = [];
  for (const row of value) {
    if (!isRecord(row)) {
      return null;
    }
    if (
      typeof row.product_slug !== "string" ||
      typeof row.product_name !== "string" ||
      typeof row.reviewer_name !== "string" ||
      typeof row.body !== "string" ||
      typeof row.created_at !== "string"
    ) {
      return null;
    }
    const rating = asCount(row.rating);
    if (rating === null || rating < 1 || rating > 5) {
      return null;
    }
    reviews.push({
      productSlug: row.product_slug,
      productName: row.product_name,
      reviewerName: row.reviewer_name,
      rating,
      body: row.body,
      createdAt: row.created_at,
    });
  }
  return reviews;
}

/**
 * The most recent approved reviews across all products, newest
 * first, for the home page — one batched call, no N+1. Returns an
 * empty array when no approved review exists yet (the normal state:
 * the home section stays hidden). Throws
 * SupabaseNotConfiguredError when the env vars are missing, and a
 * generic Error for anything else — callers catch and render
 * without reviews.
 */
export async function getRecentApprovedReviews(
  limit = HOME_REVIEWS_COUNT,
): Promise<RecentReview[]> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc(
    "get_recent_approved_reviews",
    { p_limit: limit },
  );
  if (error) {
    throw new Error("Reviews could not be loaded. Please try again.");
  }
  const parsed = parseRecentReviews(data);
  if (!parsed) {
    throw new Error("Reviews could not be loaded. Please try again.");
  }
  return parsed;
}

export type ReviewSubmitInput = {
  reference: string;
  phone: string;
  productSlug: string;
  rating: number;
  qualityRating: number | null;
  valueRating: number | null;
  fitRating: number | null;
  body: string;
};

/**
 * Thrown when submit_review rejects a review (S-7, migration 0010).
 * One plain-words message per case — the route returns it as a 400.
 * The "order not found" message covers both a missing reference and
 * a mismatched phone, so references can never be enumerated.
 */
export class ReviewSubmitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewSubmitError";
  }
}

function requireClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new SupabaseNotConfiguredError();
  }
  return supabase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function asCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

/**
 * Parse the get_product_reviews jsonb into a typed aggregate.
 * Returns null on a malformed payload — a broken contract is a
 * "no reviews" render, never a crash. Pure (unit-tested).
 */
export function parseReviewAggregate(
  value: unknown,
): ReviewAggregate | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.product_slug !== "string") {
    return null;
  }
  const reviewCount = asCount(value.review_count);
  if (reviewCount === null) {
    return null;
  }
  const averageRating = asRating(value.average_rating);
  const qualityAverage = asRating(value.quality_average);
  const valueAverage = asRating(value.value_average);
  const fitAverage = asRating(value.fit_average);
  if (!isRecord(value.breakdown)) {
    return null;
  }
  const breakdown: ReviewBreakdown = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
  for (const key of ["5", "4", "3", "2", "1"] as const) {
    const count = asCount(value.breakdown[key]);
    if (count === null) {
      return null;
    }
    breakdown[key] = count;
  }
  if (!Array.isArray(value.reviews)) {
    return null;
  }
  const reviews: PublicReview[] = [];
  for (const row of value.reviews) {
    if (!isRecord(row)) {
      return null;
    }
    if (
      typeof row.reviewer_name !== "string" ||
      typeof row.body !== "string" ||
      typeof row.created_at !== "string"
    ) {
      return null;
    }
    const rating = asCount(row.rating);
    if (rating === null || rating < 1 || rating > 5) {
      return null;
    }
    reviews.push({
      reviewerName: row.reviewer_name,
      rating,
      qualityRating: asRating(row.quality_rating),
      valueRating: asRating(row.value_rating),
      fitRating: asRating(row.fit_rating),
      body: row.body,
      createdAt: row.created_at,
    });
  }
  return {
    productSlug: value.product_slug,
    reviewCount,
    averageRating,
    breakdown,
    qualityAverage,
    valueAverage,
    fitAverage,
    reviews,
  };
}

/**
 * A zero-review aggregate for one slug — used when the reviews
 * fetch fails but the buyer arrived to write a review (?ref=…):
 * the form still renders, with no aggregate shown.
 */
export function emptyReviewAggregate(slug: string): ReviewAggregate {
  return {
    productSlug: slug,
    reviewCount: 0,
    averageRating: null,
    breakdown: { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
    qualityAverage: null,
    valueAverage: null,
    fitAverage: null,
    reviews: [],
  };
}

/**
 * Approved reviews + aggregate for one product slug. Returns a
 * zero-review aggregate (never null) when the product has no
 * approved reviews or does not exist. Throws
 * SupabaseNotConfiguredError when the env vars are missing, and a
 * generic Error for anything else — callers catch and render
 * without reviews.
 */
export async function getProductReviews(
  slug: string,
): Promise<ReviewAggregate> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("get_product_reviews", {
    p_slug: slug,
  });
  if (error) {
    throw new Error("Reviews could not be loaded. Please try again.");
  }
  const parsed = parseReviewAggregate(data);
  if (!parsed) {
    throw new Error("Reviews could not be loaded. Please try again.");
  }
  return parsed;
}

/**
 * Batch aggregates for a list of product slugs (listing cards).
 * Returns a map keyed by slug; slugs with no approved reviews map
 * to a zero-review aggregate (the function returns one row per
 * active slug). An empty input returns an empty map without a call.
 */
export async function getProductReviewAggregates(
  slugs: string[],
): Promise<Map<string, ProductReviewAggregate>> {
  const empty = new Map<string, ProductReviewAggregate>();
  if (slugs.length === 0) {
    return empty;
  }
  const supabase = requireClient();
  const { data, error } = await supabase.rpc(
    "get_product_review_aggregates",
    { p_slugs: slugs },
  );
  if (error) {
    throw new Error("Reviews could not be loaded. Please try again.");
  }
  if (!Array.isArray(data)) {
    throw new Error("Reviews could not be loaded. Please try again.");
  }
  const result = new Map<string, ProductReviewAggregate>();
  for (const row of data) {
    if (!isRecord(row) || typeof row.product_slug !== "string") {
      continue;
    }
    const reviewCount = asCount(row.review_count);
    if (reviewCount === null) {
      continue;
    }
    result.set(row.product_slug, {
      productSlug: row.product_slug,
      reviewCount,
      averageRating: asRating(row.average_rating),
    });
  }
  return result;
}

/** Map a submit_review RAISE message to a plain-words error. */
function mapSubmitReviewError(error: { message?: string }): ReviewSubmitError | null {
  const message = error.message ?? "";
  if (message.startsWith("review_order_not_found")) {
    return new ReviewSubmitError(
      "We couldn't find that order. Check the reference and phone number and try again.",
    );
  }
  if (message.startsWith("review_order_not_delivered")) {
    return new ReviewSubmitError(
      "You can leave a review once your order is delivered.",
    );
  }
  if (message.startsWith("review_product_not_found")) {
    return new ReviewSubmitError(
      "That product couldn't be found. Check the product and try again.",
    );
  }
  if (message.startsWith("review_product_not_in_order")) {
    return new ReviewSubmitError(
      "That product wasn't in this order.",
    );
  }
  if (message.startsWith("review_already_submitted")) {
    return new ReviewSubmitError(
      "You've already reviewed this product for this order.",
    );
  }
  if (
    message.startsWith("invalid_rating") ||
    message.startsWith("invalid_body")
  ) {
    return new ReviewSubmitError(
      "Please check your review and try again.",
    );
  }
  return null;
}

/**
 * Submit a verified-buyer review. The server checks the order
 * (reference + phone), the delivered status, and that the product
 * is in the order; the review is stored as 'pending' — an admin
 * approves it before it ever appears. Throws ReviewSubmitError
 * for a rejected submission, SupabaseNotConfiguredError when the
 * env vars are missing, and a generic Error for anything else.
 */
export async function submitReview(
  input: ReviewSubmitInput,
): Promise<{ reviewId: string; status: string }> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("submit_review", {
    p_reference: input.reference,
    p_phone: input.phone,
    p_product_slug: input.productSlug,
    p_rating: input.rating,
    p_quality_rating: input.qualityRating,
    p_value_rating: input.valueRating,
    p_fit_rating: input.fitRating,
    p_body: input.body,
  });
  if (error) {
    const mapped = mapSubmitReviewError(error);
    if (mapped) {
      throw mapped;
    }
    throw new Error("Your review couldn't be submitted. Please try again.");
  }
  if (!isRecord(data) || typeof data.review_id !== "string") {
    throw new Error("Your review couldn't be submitted. Please try again.");
  }
  return {
    reviewId: data.review_id,
    status: typeof data.status === "string" ? data.status : "pending",
  };
}
