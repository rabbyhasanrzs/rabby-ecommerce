import { lookupRequestSchema } from "@/lib/api-schemas";
import {
  lookupOrder,
  SupabaseNotConfiguredError,
} from "@/lib/supabase/orders";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * POST /api/orders/lookup — fetch one order by reference + phone.
 * The lookup function returns null when the reference does not exist
 * OR the phone does not match; the 404 message never says which one,
 * so order references cannot be probed.
 *
 * 200 { ok: true, order } on success.
 * 400 invalid JSON or schema failure. 404 no matching order.
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

  const parsed = lookupRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400 },
    );
  }

  try {
    const order = await lookupOrder(parsed.data.reference, parsed.data.phone);
    if (!order) {
      return Response.json(
        {
          ok: false,
          error:
            "Order not found. Check the reference and phone number and try again.",
        },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, order });
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
