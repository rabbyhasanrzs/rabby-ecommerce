import { checkoutRequestSchema } from "@/lib/api-schemas";
import { sendOrderConfirmationEmail } from "@/lib/order-email";
import {
  CHECKOUT_RATE_LIMIT,
  CHECKOUT_RATE_WINDOW_MS,
  checkRateLimit,
  getClientKey,
} from "@/lib/rate-limit";
import {
  initiateSslcommerzPayment,
  isSslcommerzConfigured,
  SslcommerzError,
} from "@/lib/sslcommerz";
import {
  createGuestOrder,
  GuestOrderError,
  recordGatewayPayment,
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
 * verification; card details are NEVER collected. S-7 adds the real
 * gateway: "online" ("Pay Online") creates the order with payment
 * pending, then redirects the customer to SSLCommerz (GatewayPageURL)
 * — the payment settles through the IPN / return handlers, and the
 * confirmation email is sent only after the payment validates.
 *
 * 200 { ok: true, reference, totalBdt } on success — plus
 * gatewayUrl for an online order (the client redirects there).
 * 400 invalid JSON / schema / customer validation failure.
 * 422 an item is gone or out of stock (bag no longer valid).
 * 429 too many checkout attempts from this IP (10 / 10 minutes).
 * 503 Supabase not configured, or online payment not configured /
 * the gateway could not start a session (no orphan order is created
 * when the gateway is not configured; a session failure after order
 * creation returns the reference with the error).
 * 500 anything else (no stack traces).
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
    const isOnline = parsed.data.customer.paymentMethod === "online";
    // S-7: the gateway must be configured BEFORE the order is
    // created — otherwise the customer would be left with an order
    // they can never pay. The settings toggle is enforced again
    // inside create_guest_order ('payment_method_disabled').
    if (isOnline && !isSslcommerzConfigured()) {
      return Response.json(
        {
          ok: false,
          error:
            "Online payment is not available right now. Please choose another payment method.",
        },
        { status: 503 },
      );
    }
    const { reference, totalBdt } = await createGuestOrder({
      customer: parsed.data.customer,
      items: parsed.data.items,
      // S-7: the coupon code, if one was applied (optional). The
      // server re-validates it at order creation — a code deactivated
      // after Apply raises 'coupon_invalid', which maps to a
      // VALIDATION error below and blocks the order.
      discountCode: parsed.data.discountCode,
    });

    if (isOnline) {
      // The order exists with payment pending. Start the gateway
      // session and hand the customer the payment page — the
      // confirmation email waits until the payment validates (the
      // IPN / return settle sends it).
      let gateway: { sessionKey: string; gatewayUrl: string };
      try {
        gateway = await initiateSslcommerzPayment({
          reference,
          totalBdt,
          customerName: parsed.data.customer.name,
          customerEmail: parsed.data.customer.email,
          customerPhone: parsed.data.customer.phone,
          customerAddress: parsed.data.customer.address,
          zone: parsed.data.customer.zone,
          totalQuantity: parsed.data.items.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
          // The request origin — staging returns to staging,
          // production to production; no new env var.
          origin: new URL(request.url).origin,
        });
      } catch (error) {
        // The order stays pending (no auto-expiry in v1 — the admin
        // cancels it by hand and the stock restores). The reference
        // is returned so the customer is not left guessing.
        const message =
          error instanceof SslcommerzError
            ? error.message
            : "Online payment could not be started. Please contact us.";
        return Response.json(
          { ok: false, error: message, reference },
          { status: 503 },
        );
      }
      // Store the session key now — the settle path only overwrites
      // gateway fields it actually receives, so this survives the
      // later settle-time write. A missing webhook secret means the
      // settle cannot verify anything later; the redirect still
      // works and the IPN fails closed — log it server-side.
      const recorded = await recordGatewayPayment(
        reference,
        { sessionKey: gateway.sessionKey },
        process.env.PAYMENT_WEBHOOK_SECRET ?? "",
      ).catch(() => null);
      if (!recorded?.ok) {
        console.error("[sslcommerz] session key not stored", reference);
      }
      return Response.json({
        ok: true,
        reference,
        totalBdt,
        gatewayUrl: gateway.gatewayUrl,
      });
    }

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
        // The mapped message is the plain-words error (e.g. the
        // coupon message from mapCreateOrderError) — show it, not a
        // generic fallback. Every VALIDATION message is plain-words
        // by construction, so surfacing it is safe.
        return Response.json(
          {
            ok: false,
            error:
              error.message || "Please check your details and try again.",
          },
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
