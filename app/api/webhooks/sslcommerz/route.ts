import { z } from "zod";
import {
  checkRateLimit,
  getClientKey,
  WEBHOOK_RATE_LIMIT,
  WEBHOOK_RATE_WINDOW_MS,
} from "@/lib/rate-limit";
import { settleSslcommerzPayment } from "@/lib/sslcommerz-settle";
import { ORDER_REFERENCE_PATTERN } from "@/lib/supabase/orders";

const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";

/**
 * The form fields SSLCommerz posts to the IPN URL. Only tran_id is
 * required — a val_id may be missing on some gateway statuses, and
 * the status itself is advisory (the settle path verifies via the
 * Validation / Query APIs; an IPN field is never proof on its own).
 * Nothing else in the form is read: amount, card_no and the rest
 * are never trusted, and the raw body is never logged.
 */
const ipnFormSchema = z.object({
  tran_id: z
    .string()
    .trim()
    .regex(
      ORDER_REFERENCE_PATTERN,
      "Enter a valid order reference (RB-2026-123456).",
    ),
  val_id: z.string().trim().min(1).optional(),
  status: z.string().trim().optional(),
});

/**
 * POST /api/webhooks/sslcommerz — SSLCommerz IPN listener (S-7).
 *
 * SSLCommerz posts a plain form (no signature header) to this URL
 * after a payment settles, so security is server-side: the settle
 * path confirms every outcome through the Validation API (paid) or
 * the Transaction Query API (failed), and the database checks the
 * webhook secret inside its RPCs. A forged or amount-tampered IPN
 * changes nothing.
 *
 * Always 200 { ok: true } when the form parses — even when the
 * order does not exist or the outcome is unconfirmed, because
 * retrying would not change those. 400 only for a malformed form
 * (no usable tran_id), 429 when rate limited.
 */
export async function POST(request: Request) {
  const ip = getClientKey(request);
  const limit = checkRateLimit(
    `webhook:sslcommerz:${ip}`,
    WEBHOOK_RATE_LIMIT,
    WEBHOOK_RATE_WINDOW_MS,
  );
  if (!limit.allowed) {
    return Response.json(
      { ok: false, error: RATE_LIMIT_ERROR },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const parsed = ipnFormSchema.safeParse({
    tran_id: form.get("tran_id"),
    val_id: form.get("val_id") ?? undefined,
    status: form.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  // Never throws by contract; every outcome is a 200.
  await settleSslcommerzPayment({
    reference: parsed.data.tran_id,
    valId: parsed.data.val_id ?? null,
    ipnStatus: parsed.data.status ?? null,
  });

  return Response.json({ ok: true });
}
