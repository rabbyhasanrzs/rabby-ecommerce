import { stockAlertSubscribeSchema } from "@/lib/api-schemas";
import {
  StockAlertError,
  subscribeStockAlert,
} from "@/lib/stock-alerts";
import {
  STOCK_ALERT_RATE_LIMIT,
  STOCK_ALERT_RATE_WINDOW_MS,
  checkRateLimit,
  getClientKey,
} from "@/lib/rate-limit";
import { SupabaseNotConfiguredError } from "@/lib/supabase/orders";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";
/**
 * One shared message for a new subscription AND an
 * already-subscribed email — the function no-ops on the dedupe, so
 * the route can never reveal whether an email is on the list.
 */
const SUBSCRIBED_MESSAGE = "We'll email you when this is back in stock.";

/**
 * POST /api/stock-alerts — subscribe to a back-in-stock alert
 * (S-7; no documented scope, owner-approved standard setup).
 *
 * The body is validated against stockAlertSubscribeSchema first;
 * the server then stores the subscription through
 * subscribe_stock_alert (migration 0013, SECURITY DEFINER): the
 * product must exist, be active, and be out of stock, and the
 * email shape must be valid. One pending row per email + product —
 * a second subscribe is a no-op with the same success message.
 *
 * 200 { ok: true, message } on success (new or already subscribed).
 * 400 invalid JSON / schema, or a rejected subscription (plain-words
 *   message — "in stock now" for an in-stock product).
 * 429 too many subscriptions from this IP (10 / 10 minutes).
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

  const parsed = stockAlertSubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400 },
    );
  }

  // Same pattern as review / coupon validate: checked AFTER the
  // schema parse, so malformed requests never consume budget.
  const alertLimit = checkRateLimit(
    `stock-alert:ip:${getClientKey(request)}`,
    STOCK_ALERT_RATE_LIMIT,
    STOCK_ALERT_RATE_WINDOW_MS,
  );
  if (!alertLimit.allowed) {
    return Response.json(
      { ok: false, error: RATE_LIMIT_ERROR },
      {
        status: 429,
        headers: { "Retry-After": String(alertLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    await subscribeStockAlert({
      productSlug: parsed.data.productSlug,
      email: parsed.data.email,
    });
    return Response.json({ ok: true, message: SUBSCRIBED_MESSAGE });
  } catch (error) {
    if (error instanceof StockAlertError) {
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
