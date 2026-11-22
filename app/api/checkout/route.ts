import { checkoutRequestSchema } from "@/lib/api-schemas";
import { sendOrderConfirmationEmail } from "@/lib/order-email";
import {
  CHECKOUT_RATE_LIMIT,
  CHECKOUT_RATE_WINDOW_MS,
  checkRateLimit,
  getClientKey,
} from "@/lib/rate-limit";
import {
  createGuestOrder,
  GuestOrderError,
  SupabaseNotConfiguredError,
} from "@/lib/supabase/orders";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";

/**
 * POST /api/checkout — create a guest order. The server re-prices every
 * line from the products table and decrements stock in one transaction
 * (migration 0004, create_guest_order); client-sent prices are never
 * trusted. Payment is DEMO-SAFE (S-3, owner decision D-1): COD works
 * fully; mobile banking takes a TrxID + sender number for manual
 * verification; card details are NEVER collected. No gateway, no real
 * money moves in S-3 — the payment status on the order is 'cod' for
 * COD and 'pending' otherwise, until Slice B's webhook marks it.
 *
 * 200 { ok: true, reference, totalBdt } on success.
 * 400 invalid JSON / schema / customer validation failure.
 * 422 an item is gone or out of stock (bag no longer valid).
 * 429 too many checkout attempts from this IP (10 / 10 minutes).
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

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400 },
    );
  }

  // S-6 (T-61, S6-03): checkout is the one public route that writes
  // (order + stock decrement in one transaction). Checked AFTER the
  // schema parse, so malformed requests never consume budget.
  const checkoutLimit = checkRateLimit(
    `checkout:ip:${getClientKey(request)}`,
    CHECKOUT_RATE_LIMIT,
    CHECKOUT_RATE_WINDOW_MS,
  );
  if (!checkoutLimit.allowed) {
    return Response.json(
      { ok: false, error: RATE_LIMIT_ERROR },
      {
        status: 429,
        headers: { "Retry-After": String(checkoutLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const { reference, totalBdt } = await createGuestOrder({
      customer: parsed.data.customer,
      items: parsed.data.items,
    });
    // S-6: order confirmation email (Launch Decision 4, Gmail SMTP).
    // A failure here must NEVER fail the order: the send function
    // never throws, and this call is wrapped as well, so the customer
    // always gets the success response. Missing env vars = skipped.
    try {
      await sendOrderConfirmationEmail({
        reference,
        phone: parsed.data.customer.phone,
        customerEmail: parsed.data.customer.email,
      });
    } catch (error) {
      console.error(
        "[order-email] confirmation email failed",
        reference,
        error instanceof Error ? error.message : "unknown error",
      );
    }
    return Response.json({ ok: true, reference, totalBdt });
  } catch (error) {
    if (error instanceof GuestOrderError) {
      if (
        error.code === "INSUFFICIENT_STOCK" ||
        error.code === "NOT_FOUND"
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Some items are no longer available. Please review your bag.",
            issues: [
              {
                slug: error.slug ?? "",
                type:
                  error.code === "INSUFFICIENT_STOCK"
                    ? "insufficient_stock"
                    : "not_found",
              },
            ],
          },
          { status: 422 },
        );
      }
      if (error.code === "VALIDATION") {
        return Response.json(
          { ok: false, error: "Please check your details and try again." },
          { status: 400 },
        );
      }
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
