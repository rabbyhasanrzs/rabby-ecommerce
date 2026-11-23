import { reviewSubmitRequestSchema } from "@/lib/api-schemas";
import {
  REVIEW_RATE_LIMIT,
  REVIEW_RATE_WINDOW_MS,
  checkRateLimit,
  getClientKey,
} from "@/lib/rate-limit";
import {
  ReviewSubmitError,
  submitReview,
} from "@/lib/supabase/reviews";
import { SupabaseNotConfiguredError } from "@/lib/supabase/orders";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";

/**
 * POST /api/reviews — submit a verified-buyer review (S-7, T-70).
 *
 * The body is validated against reviewSubmitRequestSchema first;
 * the server then checks the purchase through submit_review
 * (migration 0010, SECURITY DEFINER): reference + phone must match
 * a delivered order that contains the product, and only one review
 * per order+product is allowed. The review is stored as 'pending'
 * — an admin approves it before it ever appears on the site.
 *
 * 200 { ok: true, status: "pending" } on success.
 * 400 invalid JSON / schema, or a rejected submission (plain-words
 *   message — "order not found" covers both a missing reference
 *   and a mismatched phone, so references cannot be enumerated).
 * 429 too many submissions from this IP (10 / 10 minutes).
 * 503 Supabase not configured. 500 anything else (no stack traces).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const parsed = reviewSubmitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400 },
    );
  }

  // Same pattern as checkout / coupon validate: checked AFTER the
  // schema parse, so malformed requests never consume budget.
  const reviewLimit = checkRateLimit(
    `review:ip:${getClientKey(request)}`,
    REVIEW_RATE_LIMIT,
    REVIEW_RATE_WINDOW_MS,
  );
  if (!reviewLimit.allowed) {
    return Response.json(
      { ok: false, error: RATE_LIMIT_ERROR },
      {
        status: 429,
        headers: { "Retry-After": String(reviewLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const { status } = await submitReview({
      reference: parsed.data.reference,
      phone: parsed.data.phone,
      productSlug: parsed.data.productSlug,
      rating: parsed.data.rating,
      qualityRating: parsed.data.qualityRating ?? null,
      valueRating: parsed.data.valueRating ?? null,
      fitRating: parsed.data.fitRating ?? null,
      body: parsed.data.body,
    });
    return Response.json({ ok: true, status });
  } catch (error) {
    if (error instanceof ReviewSubmitError) {
      return Response.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }
    if (error instanceof SupabaseNotConfiguredError) {
      return Response.json(
        {
          ok: false,
          error: "Service temporarily unavailable. Please try again.",
        },
        { status: 503 },
      );
    }
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
}
