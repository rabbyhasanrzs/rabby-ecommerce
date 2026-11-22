import { z } from "zod";
import {
  checkRateLimit,
  getClientKey,
  WEBHOOK_RATE_LIMIT,
  WEBHOOK_RATE_WINDOW_MS,
} from "@/lib/rate-limit";
import {
  ORDER_REFERENCE_PATTERN,
  markOrderPaymentStatus,
} from "@/lib/supabase/orders";
import { verifyWebhookSignature } from "@/lib/webhook-signature";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";
const INVALID_SIGNATURE_ERROR = "Invalid signature.";

/** Payload a gateway posts after a payment settles. Validated only AFTER the signature checks out. */
const webhookPayloadSchema = z.object({
  reference: z
    .string()
    .trim()
    .regex(
      ORDER_REFERENCE_PATTERN,
      "Enter a valid order reference (RB-2026-123456).",
    ),
  status: z.enum(["paid", "failed"]),
});

/**
 * POST /api/webhooks/payment — mark an order paid / failed (S-3, T-32).
 *
 * DEMO-SAFE MODE: no payment provider is wired in S-3, and
 * PAYMENT_WEBHOOK_SECRET is never set — so this route rejects every
 * request with 401 "Invalid signature." and changes no state. That is
 * the intended behaviour until a real gateway is chosen (S-6); the
 * route + verification helper exist now so the gateway plugs in
 * without a new endpoint.
 *
 * Order of checks: rate limit (20/min/IP) -> signature (over the RAW
 * body, never parsed first) -> JSON + schema -> payment-status update.
 * The raw body is read with request.text(); request.json() is never
 * called before verification, because the signature is over the raw
 * bytes. No order details are ever leaked in a response.
 *
 * 200 { ok: true } on success.
 * 400 invalid JSON / schema failure / invalid status.
 * 401 missing secret, missing signature, or verification failure.
 * 404 no order with that reference. 409 payment status cannot change.
 * 429 rate limited (Retry-After header). 500 anything else (no stack traces).
 */
export async function POST(request: Request) {
  const ip = getClientKey(request);
  const limit = checkRateLimit(
    `webhook:ip:${ip}`,
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

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? "";
  const signature = request.headers.get("x-webhook-signature");
  if (
    !secret ||
    !signature ||
    !(await verifyWebhookSignature({ rawBody, signature, secret }))
  ) {
    // Same response whether the secret is unset, the header is missing,
    // or verification failed — never reveal which one.
    return Response.json(
      { ok: false, error: INVALID_SIGNATURE_ERROR },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const parsed = webhookPayloadSchema.safeParse(body);
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
    // S-6 (migration 0006): the secret is also checked INSIDE the
    // function, so a direct RPC call with the public anon key cannot
    // mark an order paid. The route only reaches this call after the
    // HMAC check above passed, so "unauthorized" here means the
    // database secret and the env secret are out of sync — a server
    // misconfiguration, reported as a generic 500.
    const result = await markOrderPaymentStatus(
      parsed.data.reference,
      parsed.data.status,
      secret,
    );
    if (result.ok) {
      return Response.json({ ok: true });
    }
    if (result.error === "not_found") {
      return Response.json(
        { ok: false, error: "Order not found." },
        { status: 404 },
      );
    }
    if (result.error === "invalid_status") {
      return Response.json(
        { ok: false, error: "Invalid payment status." },
        { status: 400 },
      );
    }
    if (result.error === "invalid_transition") {
      return Response.json(
        { ok: false, error: "Payment status cannot be changed." },
        { status: 409 },
      );
    }
    return Response.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 500 },
    );
  } catch {
    return Response.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 500 },
    );
  }
}
