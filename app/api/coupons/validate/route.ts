import { couponValidateRequestSchema } from "@/lib/api-schemas";
import { computeDiscountedTotals, settingsToPricing } from "@/lib/pricing";
import {
  COUPON_RATE_LIMIT,
  COUPON_RATE_WINDOW_MS,
  checkRateLimit,
  getClientKey,
} from "@/lib/rate-limit";
import { getSiteSettings } from "@/lib/site-settings";
import {
  CouponInvalidError,
  SupabaseNotConfiguredError,
  validateDiscountCode,
} from "@/lib/supabase/orders";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";

/**
 * POST /api/coupons/validate — check a coupon code and preview the
 * discounted totals (S-7, T-70). The checkout form calls this on
 * Apply so the customer sees the discounted total before paying;
 * the code is re-validated at order creation (POST /api/checkout),
 * so a code deactivated in between still blocks the order.
 *
 * The code is checked through validate_discount_code (migration
 * 0009, SECURITY DEFINER — discount_codes has no anon policy), which
 * raises 'coupon_invalid' for a missing code and an inactive code
 * alike. Both cases return the SAME 400 message, so codes cannot be
 * enumerated by probing. Totals use the site_settings tax + delivery
 * fees (getSiteSettings falls back to the DEMO CONFIG values when
 * the row is missing) and the discounted-totals helper in
 * lib/pricing.ts — discount first, tax on the discounted subtotal,
 * integer BDT throughout.
 *
 * 200 { ok: true, percentOff, discountBdt, totals } on success.
 * 400 invalid JSON / schema, or an unknown or inactive code.
 * 429 too many validation attempts from this IP (10 / 10 minutes).
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

  const parsed = couponValidateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400 },
    );
  }

  // Same pattern as checkout (S-6, T-61, S6-03): checked AFTER the
  // schema parse, so malformed requests never consume budget.
  const couponLimit = checkRateLimit(
    `coupon:ip:${getClientKey(request)}`,
    COUPON_RATE_LIMIT,
    COUPON_RATE_WINDOW_MS,
  );
  if (!couponLimit.allowed) {
    return Response.json(
      { ok: false, error: RATE_LIMIT_ERROR },
      {
        status: 429,
        headers: { "Retry-After": String(couponLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const { percentOff } = await validateDiscountCode(parsed.data.code);
    const settings = await getSiteSettings();
    const totals = computeDiscountedTotals(
      parsed.data.subtotalBdt,
      parsed.data.zone,
      percentOff,
      settingsToPricing(settings),
    );
    return Response.json({
      ok: true,
      percentOff,
      discountBdt: totals.discountBdt,
      totals,
    });
  } catch (error) {
    if (error instanceof CouponInvalidError) {
      // One message for a missing code and an inactive code alike.
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
