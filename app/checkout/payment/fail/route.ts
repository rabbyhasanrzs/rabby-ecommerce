import { NextResponse } from "next/server";
import { z } from "zod";
import { settleSslcommerzPayment } from "@/lib/sslcommerz-settle";
import { ORDER_REFERENCE_PATTERN } from "@/lib/supabase/orders";

/**
 * POST /checkout/payment/fail — SSLCommerz fail return (S-7).
 *
 * The gateway posts the customer back here when the payment did
 * not go through. The return is NOT proof: the settle path first
 * tries the Validation API (a val_id may still be present), then
 * confirms the failure through the Transaction Query API before
 * anything is marked failed. An unconfirmed failure leaves the
 * order pending for the admin — never failed on the gateway's word
 * alone.
 *
 * Redirects (303, so a refresh never re-posts):
 * - failed / already settled -> the confirmation page (it shows the
 *   order's real state, with payment=failed when the failure was
 *   just confirmed)
 * - anything inconclusive -> the confirmation page with
 *   payment=failed ("your payment didn't go through")
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
    ipnStatus: "FAILED",
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
  url.searchParams.set("payment", "failed");
  return NextResponse.redirect(url, 303);
}
