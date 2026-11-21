import { cancelRequestSchema } from "@/lib/api-schemas";
import {
  checkRateLimit,
  getClientKey,
  ORDER_RATE_LIMIT,
  ORDER_RATE_WINDOW_MS,
} from "@/lib/rate-limit";
import {
  cancelOrder,
  SupabaseNotConfiguredError,
} from "@/lib/supabase/orders";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";

/**
 * POST /api/orders/cancel — cancel an order by reference + phone.
 * Cancellation is allowed only before the order ships (placed /
 * confirmed / processing / packed); the function restores stock.
 *
 * 200 { ok: true } on success.
 * 200 { ok: false, error: "too_late", message } when already shipped.
 * 400 invalid JSON or schema failure. 404 no matching order.
 * 429 rate limited (Retry-After header).
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

  const parsed = cancelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400 },
    );
  }

  // G-C4: two independent budgets, both 10 attempts / 10 minutes —
  // one per client IP (stops one IP guessing many references) and one
  // per reference + phone pair (stops many IPs guessing one order).
  // Checked AFTER the schema parse, so malformed requests never
  // consume budget and the key can include the validated reference.
  const ip = getClientKey(request);
  for (const key of [
    `cancel:ip:${ip}`,
    `cancel:ref:${parsed.data.reference}:${parsed.data.phone}`,
  ]) {
    const limit = checkRateLimit(key, ORDER_RATE_LIMIT, ORDER_RATE_WINDOW_MS);
    if (!limit.allowed) {
      return Response.json(
        { ok: false, error: RATE_LIMIT_ERROR },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }
  }

  try {
    const result = await cancelOrder(parsed.data.reference, parsed.data.phone);
    if (!result.ok && result.error === "not_found") {
      return Response.json(
        {
          ok: false,
          error:
            "Order not found. Check the reference and phone number and try again.",
        },
        { status: 404 },
      );
    }
    if (!result.ok && result.error === "too_late") {
      return Response.json(
        {
          ok: false,
          error: "too_late",
          message:
            "This order has already shipped and can no longer be cancelled.",
        },
        { status: 200 },
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
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
