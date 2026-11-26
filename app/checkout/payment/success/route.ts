import { NextResponse } from "next/server";
import { z } from "zod";
import { settleSslcommerzPayment } from "@/lib/sslcommerz-settle";
import { ORDER_REFERENCE_PATTERN } from "@/lib/supabase/orders";

/**
 * POST /checkout/payment/success — SSLCommerz success return (S-7).
 *
 * The gateway posts the customer back here after a successful
 * payment. The return is NOT proof: the settle path validates the
 * val_id against the Validation API (tran_id + amount + BDT, all
 * three) before anything is marked paid. A forged return — or one
 * with a tampered amount — changes nothing.
 *
 * Redirects (303, so a refresh never re-posts):
 * - paid / already settled -> the confirmation page (it shows the
 *   paid order)
 * - anything inconclusive -> the confirmation page with
 *   payment=confirming ("we are still confirming your payment")
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
    ipnStatus: "VALID",
  });

  const url = new URL(
    `/order/confirmation?ref=${encodeURIComponent(parsed.data.tran_id)}`,
    origin,
  );
  if (outcome === "paid" || outcome === "already_settled") {
    return NextResponse.redirect(url, 303);
  }
  if (outcome === "not_found") {
    return NextResponse.redirect(new URL("/", origin), 303);
  }
  url.searchParams.set("payment", "confirming");
  return NextResponse.redirect(url, 303);
}
