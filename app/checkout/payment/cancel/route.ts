import { NextResponse } from "next/server";
import { z } from "zod";
import { settleSslcommerzPayment } from "@/lib/sslcommerz-settle";
import { ORDER_REFERENCE_PATTERN } from "@/lib/supabase/orders";

/**
 * POST /checkout/payment/cancel — SSLCommerz cancel return (S-7).
 *
 * The gateway posts the customer back here when they cancel the
 * payment on the gateway page. Same rule as the fail return: the
 * settle path confirms the cancellation through the Transaction
 * Query API before anything is marked failed. An unconfirmed
 * cancellation leaves the order pending — there is no auto-expiry
 * in v1, the admin cancels it by hand.
 *
 * Redirects (303, so a refresh never re-posts):
 * - already settled -> the confirmation page (it shows the order's
 *   real state)
 * - anything else -> the confirmation page with payment=cancelled
 * - no usable tran_id -> home
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(new URL("/", origin), 303);
  }

  const parsed = z
    .object({
      tran_id: z
        .string()
        .trim()
        .regex(ORDER_REFERENCE_PATTERN),
      val_id: z.string().trim().min(1).optional(),
    })
    .safeParse({
      tran_id: form.get("tran_id"),
      val_id: form.get("val_id") ?? undefined,
    });
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/", origin), 303);
  }

  const outcome = await settleSslcommerzPayment({
    reference: parsed.data.tran_id,
    valId: parsed.data.val_id ?? null,
    ipnStatus: "CANCELLED",
  });

  const url = new URL(
    `/order/confirmation?ref=${encodeURIComponent(parsed.data.tran_id)}`,
    origin,
  );
  if (outcome === "already_settled") {
    return NextResponse.redirect(url, 303);
  }
  if (outcome === "not_found") {
    return NextResponse.redirect(new URL("/", origin), 303);
  }
  url.searchParams.set("payment", "cancelled");
  return NextResponse.redirect(url, 303);
}
