import { sendOrderConfirmationEmail, sendPaymentFailedEmail } from "@/lib/order-email";
import {
  checkSslcommerzValidation,
  querySslcommerzTransaction,
  sslcommerzStatusOutcome,
  validateSslcommerzTransaction,
  type SslcommerzGatewayRecord,
} from "@/lib/sslcommerz";
import {
  getGatewayOrder,
  markOrderPaymentStatus,
  recordGatewayPayment,
} from "@/lib/supabase/orders";

/**
 * Settle one SSLCommerz payment (S-7) — the single path the IPN
 * listener and the success / fail / cancel return handlers share,
 * so a payment settles exactly once no matter which one arrives
 * first.
 *
 * Order of proof (the docs' rule): the Validation API (or, for a
 * failed transaction, the Transaction Query API) is the only proof.
 * An IPN field is never trusted on its own. The pending-only RPCs
 * make replays safe by construction: a second settle attempt finds
 * the payment already settled and stops.
 *
 * Outcomes:
 * - "paid" — validation proved the payment; the order is marked
 *   paid and the confirmation email is sent (only when the mark
 *   actually moved the payment — a replay sends nothing twice).
 * - "failed" — the query proved the gateway failed / cancelled it;
 *   the order is marked failed and the payment-failed email is
 *   sent (same once-only rule).
 * - "already_settled" — the payment was already paid / failed (a
 *   replayed IPN or a return after the IPN). Nothing changes.
 * - "not_found" — no order with that reference. Nothing changes.
 * - "unconfirmed" — the gateway could not prove the outcome
 *   (invalid validation, amount mismatch, inconclusive query, or
 *   an EXPIRED / UNATTEMPTED status). Nothing changes; the order
 *   stays pending for the admin to sort out by hand.
 * - "not_configured" — the gateway credentials (or the webhook
 *   secret) are not set up, so nothing can be verified. Nothing
 *   changes; the owner sees the server log.
 * - "error" — the database call itself failed. Nothing is assumed.
 *
 * Never throws: every failure path returns an outcome after a
 * server-side log (reference + outcome only — no customer data, no
 * secrets, no card details).
 */

export type SslcommerzSettleOutcome =
  | "paid"
  | "failed"
  | "already_settled"
  | "not_found"
  | "unconfirmed"
  | "not_configured"
  | "error";

/**
 * The server-side webhook secret (PAYMENT_WEBHOOK_SECRET) — the
 * same secret the database checks inside mark_order_payment_status
 * / record_gateway_payment / get_gateway_order (migration 0006).
 * Empty when unset: every RPC then answers "unauthorized" and the
 * settle fails closed.
 */
function webhookSecret(): string {
  return process.env.PAYMENT_WEBHOOK_SECRET ?? "";
}

function logOutcome(
  reference: string,
  outcome: SslcommerzSettleOutcome,
  detail?: string,
): void {
  console.error(
    "[sslcommerz] settle",
    reference,
    outcome,
    detail ?? "",
  );
}

async function markPaidAndEmail(input: {
  reference: string;
  secret: string;
  gateway: SslcommerzGatewayRecord;
  contact: { customerPhone: string; customerEmail: string };
}): Promise<SslcommerzSettleOutcome> {
  const recorded = await recordGatewayPayment(
    input.reference,
    {
      valId: input.gateway.valId,
      bankTranId: input.gateway.bankTranId,
      cardBrand: input.gateway.cardBrand,
      storeAmountBdt: input.gateway.storeAmountBdt,
      riskLevel: input.gateway.riskLevel,
    },
    input.secret,
  );
  if (!recorded.ok) {
    if (recorded.error === "invalid_transition") {
      return "already_settled";
    }
    if (recorded.error === "unauthorized") {
      logOutcome(input.reference, "not_configured", "record unauthorized");
      return "not_configured";
    }
    return "error";
  }
  const marked = await markOrderPaymentStatus(
    input.reference,
    "paid",
    input.secret,
  );
  if (!marked.ok) {
    if (marked.error === "invalid_transition") {
      return "already_settled";
    }
    if (marked.error === "unauthorized") {
      logOutcome(input.reference, "not_configured", "mark unauthorized");
      return "not_configured";
    }
    return "error";
  }
  // The mark moved the payment — this settle owns the confirmation
  // email. A replay never reaches here (invalid_transition above),
  // so the customer is emailed exactly once. The email never throws
  // by contract; the try/catch is a belt under the braces.
  try {
    await sendOrderConfirmationEmail({
      reference: input.reference,
      phone: input.contact.customerPhone,
      customerEmail: input.contact.customerEmail,
    });
  } catch {
    // The payment is marked paid either way; the email failure is
    // in notification_log via the send function itself.
  }
  return "paid";
}

async function markFailedAndEmail(input: {
  reference: string;
  secret: string;
  gateway: SslcommerzGatewayRecord | null;
}): Promise<SslcommerzSettleOutcome> {
  if (input.gateway) {
    const recorded = await recordGatewayPayment(
      input.reference,
      {
        valId: input.gateway.valId,
        bankTranId: input.gateway.bankTranId,
        cardBrand: input.gateway.cardBrand,
        storeAmountBdt: input.gateway.storeAmountBdt,
        riskLevel: input.gateway.riskLevel,
      },
      input.secret,
    );
    if (!recorded.ok) {
      if (recorded.error === "invalid_transition") {
        return "already_settled";
      }
      if (recorded.error === "unauthorized") {
        logOutcome(input.reference, "not_configured", "record unauthorized");
        return "not_configured";
      }
      return "error";
    }
  }
  const marked = await markOrderPaymentStatus(
    input.reference,
    "failed",
    input.secret,
  );
  if (!marked.ok) {
    if (marked.error === "invalid_transition") {
      return "already_settled";
    }
    if (marked.error === "unauthorized") {
      logOutcome(input.reference, "not_configured", "mark unauthorized");
      return "not_configured";
    }
    return "error";
  }
  // Same once-only rule as the paid path: only the settle that
  // moved the payment sends the email. The Cancelled-order guard
  // lives inside sendPaymentFailedEmail.
  try {
    await sendPaymentFailedEmail({ reference: input.reference });
  } catch {
    // The payment is marked failed either way.
  }
  return "failed";
}

/**
 * Settle one gateway payment. `valId` comes from an IPN or a
 * success return; `ipnStatus` is the IPN's own status field
 * (VALID / FAILED / CANCELLED / ...), used only to decide whether
 * a failed outcome is worth confirming via the Transaction Query
 * API — never as proof on its own.
 */
export async function settleSslcommerzPayment(input: {
  reference: string;
  valId?: string | null;
  ipnStatus?: string | null;
}): Promise<SslcommerzSettleOutcome> {
  const secret = webhookSecret();
  if (!secret) {
    logOutcome(input.reference, "not_configured", "webhook secret missing");
    return "not_configured";
  }

  let order: Awaited<ReturnType<typeof getGatewayOrder>>;
  try {
    order = await getGatewayOrder(input.reference, secret);
  } catch {
    logOutcome(input.reference, "error", "get_gateway_order failed");
    return "error";
  }
  if (!order) {
    logOutcome(input.reference, "not_found");
    return "not_found";
  }
  if (order.paymentStatus !== "pending") {
    return "already_settled";
  }
  if (order.paymentMethod !== "online") {
    logOutcome(
      input.reference,
      "unconfirmed",
      "order is not an online payment",
    );
    return "unconfirmed";
  }

  // 1. A val_id to validate — the success path. Only a VALID /
  //    VALIDATED verdict with matching tran_id + amount + BDT
  //    proves the payment.
  if (input.valId) {
    let validation;
    try {
      validation = await validateSslcommerzTransaction(input.valId);
    } catch {
      logOutcome(input.reference, "unconfirmed", "validation call failed");
      return "unconfirmed";
    }
    const verdict = checkSslcommerzValidation(validation, {
      reference: input.reference,
      totalBdt: order.totalBdt,
    });
    if (verdict.paid && verdict.gateway) {
      try {
        return await markPaidAndEmail({
          reference: input.reference,
          secret,
          gateway: verdict.gateway,
          contact: {
            customerPhone: order.customerPhone,
            customerEmail: order.customerEmail,
          },
        });
      } catch {
        logOutcome(input.reference, "error", "mark paid failed");
        return "error";
      }
    }
    logOutcome(input.reference, "unconfirmed", verdict.reason);
    // A failed IPN still carries a val_id — fall through to the
    // query path below to confirm the failure, instead of
    // stopping here.
    if (
      input.ipnStatus !== "FAILED" &&
      input.ipnStatus !== "CANCELLED"
    ) {
      return "unconfirmed";
    }
  }

  // 2. A failed / cancelled outcome to confirm — the Validation API
  //    cannot confirm a failed transaction, so the Transaction Query
  //    API is the proof. Anything else stays pending.
  if (input.ipnStatus === "FAILED" || input.ipnStatus === "CANCELLED") {
    let queried;
    try {
      queried = await querySslcommerzTransaction(input.reference);
    } catch {
      logOutcome(input.reference, "unconfirmed", "query call failed");
      return "unconfirmed";
    }
    const outcome = sslcommerzStatusOutcome(queried.status);
    if (outcome === "failed") {
      const gateway: SslcommerzGatewayRecord | null = queried.val_id
        ? {
            valId: queried.val_id,
            bankTranId: queried.bank_tran_id ?? null,
            cardBrand: queried.card_brand ?? null,
            storeAmountBdt:
              queried.store_amount !== undefined &&
              !Number.isNaN(Number(queried.store_amount))
                ? Math.round(Number(queried.store_amount))
                : null,
            riskLevel:
              queried.risk_level !== undefined &&
              !Number.isNaN(Number(queried.risk_level))
                ? Number(queried.risk_level)
                : null,
          }
        : null;
      try {
        return await markFailedAndEmail({
          reference: input.reference,
          secret,
          gateway,
        });
      } catch {
        logOutcome(input.reference, "error", "mark failed failed");
        return "error";
      }
    }
    if (outcome === "paid") {
      // The query says paid but validation did not — do not mark
      // anything on a contradiction; the IPN validation is the
      // authority for paid. Leave it pending and log it.
      logOutcome(
        input.reference,
        "unconfirmed",
        "query says paid but validation did not",
      );
      return "unconfirmed";
    }
    logOutcome(
      input.reference,
      "unconfirmed",
      `query status is ${queried.status}`,
    );
    return "unconfirmed";
  }

  return "unconfirmed";
}
