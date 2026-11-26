import { z } from "zod";

/**
 * SSLCommerz gateway client (S-7) — plain fetch, no SDK.
 *
 * Server-only: the store credentials come from server-only env vars
 * (SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD /
 * SSLCOMMERZ_SANDBOX), read at call time — never at import — so a
 * missing configuration cannot crash the build. Missing credentials
 * means "not configured": the online method is off by construction
 * (the checkout route checks before creating an order, and the
 * settings toggle defaults off). No credential value is ever logged:
 * the initiate body carries the store password, so request bodies
 * are never logged here.
 *
 * Flow (hosted checkout, official docs v4.00 — see the S-7
 * SSLCommerz investigation note): initiate POST -> GatewayPageURL
 * redirect -> IPN POST -> Order Validation API GET. Only the
 * Validation API proves a payment: neither the IPN nor the browser
 * return is trusted on its own. The verdict checker below enforces
 * that (tran_id + amount + currency, all three).
 *
 * No official Node SDK exists — plain fetch is the integration.
 */

export const SSLCOMMERZ_SANDBOX_BASE_URL =
  "https://sandbox.sslcommerz.com";
export const SSLCOMMERZ_LIVE_BASE_URL =
  "https://securepay.sslcommerz.com";

/** Hard cap on waiting for an SSLCommerz API call. */
export const SSLCOMMERZ_REQUEST_TIMEOUT_MS = 15_000;

export class SslcommerzError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SslcommerzError";
  }
}

export interface SslcommerzConfig {
  storeId: string;
  storePassword: string;
  /** True -> sandbox endpoints, false -> live endpoints. */
  sandbox: boolean;
  baseUrl: string;
}

/**
 * Read the gateway configuration from the environment. Null when
 * the store credentials are missing — the caller treats that as
 * "online payment is not available", never as an error to throw at
 * import or build time. SSLCOMMERZ_SANDBOX is env-only (never a
 * settings toggle): "true" means sandbox, anything else means live.
 */
export function getSslcommerzConfig(): SslcommerzConfig | null {
  const storeId = process.env.SSLCOMMERZ_STORE_ID ?? "";
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD ?? "";
  if (!storeId || !storePassword) {
    return null;
  }
  const sandbox = process.env.SSLCOMMERZ_SANDBOX === "true";
  return {
    storeId,
    storePassword,
    sandbox,
    baseUrl: sandbox
      ? SSLCOMMERZ_SANDBOX_BASE_URL
      : SSLCOMMERZ_LIVE_BASE_URL,
  };
}

export function isSslcommerzConfigured(): boolean {
  return getSslcommerzConfig() !== null;
}

/** BDT integer -> SSLCommerz decimal string ("1234.00"). */
export function formatSslcommerzAmount(totalBdt: number): string {
  return `${totalBdt}.00`;
}

/** Parse an SSLCommerz decimal amount ("1234.00") back to integer BDT. Null when it is not a number. */
export function parseSslcommerzAmount(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed);
}

// ---------------------------------------------------------------------------
// Initiate session
// ---------------------------------------------------------------------------

export interface SslcommerzInitiateInput {
  /** Order reference — the tran_id (unique per transaction). */
  reference: string;
  totalBdt: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  zone: "inside" | "outside";
  /** Total item count across the order (num_of_item). */
  totalQuantity: number;
  /** Public origin of this deployment (request origin) — the
   *  success / fail / cancel / IPN URLs are built from it, so
   *  staging returns to staging and production to production. */
  origin: string;
}

export interface SslcommerzInitiateResult {
  sessionKey: string;
  gatewayUrl: string;
}

const initiateResponseSchema = z.object({
  status: z.string(),
  sessionkey: z.string().optional(),
  GatewayPageURL: z.string().optional(),
  failedreason: z.string().optional(),
});

/**
 * Create a payment session: POST the order to SSLCommerz and get
 * the GatewayPageURL the customer's browser is redirected to.
 *
 * Customer fields: the checkout form collects name, email, phone
 * and address — but NOT city or postcode, so those two are mapped
 * from the delivery zone (Dhaka for Inside Dhaka, Bangladesh
 * otherwise; postcode is sent empty). Verified against the live
 * sandbox 2026-11-26: an empty cus_postcode is accepted — the
 * initiate rejection that day was the shipping_method (see below),
 * not the postcode.
 *
 * Throws SslcommerzError on any failure (network, HTTP error, bad
 * response, or a FAILED status). The error message never contains
 * a credential.
 */
export async function initiateSslcommerzPayment(
  input: SslcommerzInitiateInput,
): Promise<SslcommerzInitiateResult> {
  const config = getSslcommerzConfig();
  if (!config) {
    throw new SslcommerzError(
      "Online payment is not available right now. Please choose another payment method.",
    );
  }

  const body = new URLSearchParams({
    store_id: config.storeId,
    store_passwd: config.storePassword,
    total_amount: formatSslcommerzAmount(input.totalBdt),
    currency: "BDT",
    tran_id: input.reference,
    success_url: `${input.origin}/checkout/payment/success`,
    fail_url: `${input.origin}/checkout/payment/fail`,
    cancel_url: `${input.origin}/checkout/payment/cancel`,
    ipn_url: `${input.origin}/api/webhooks/sslcommerz`,
    cus_name: input.customerName,
    cus_email: input.customerEmail,
    cus_add1: input.customerAddress,
    cus_city: input.zone === "inside" ? "Dhaka" : "Bangladesh",
    // Not collected at checkout — see the header note above.
    cus_postcode: "",
    cus_country: "Bangladesh",
    cus_phone: input.customerPhone,
    product_name: "RabbY sunglasses order",
    product_category: "Sunglasses",
    // "NO", not "Courier": the gateway requires ship_* fields for
    // Courier/YES and we do not use SSLCommerz logistics — delivery
    // is handled by our own courier and the customer address is
    // already in cus_add1. Verified against the live sandbox
    // 2026-11-26: "Courier" with no ship_* fields is rejected with
    // "'ship_name' is missing", "NO" is accepted.
    shipping_method: "NO",
    num_of_item: String(input.totalQuantity),
  });

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(SSLCOMMERZ_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SslcommerzError(
      "Online payment is not available right now. Please try again in a few minutes.",
    );
  }
  if (!response.ok) {
    throw new SslcommerzError(
      "Online payment is not available right now. Please try again in a few minutes.",
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new SslcommerzError(
      "Online payment is not available right now. Please try again in a few minutes.",
    );
  }
  const parsed = initiateResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new SslcommerzError(
      "Online payment is not available right now. Please try again in a few minutes.",
    );
  }
  if (
    parsed.data.status !== "SUCCESS" ||
    !parsed.data.sessionkey ||
    !parsed.data.GatewayPageURL
  ) {
    // Log the gateway's own reason (status + failedreason only —
    // never the request body, which carries the store password) so
    // a rejected initiate is diagnosable from the server logs.
    console.error("[sslcommerz] initiate rejected", {
      status: parsed.data.status,
      failedreason: parsed.data.failedreason ?? "",
    });
    throw new SslcommerzError(
      "Online payment could not be started. Please choose another payment method or contact us.",
    );
  }
  return {
    sessionKey: parsed.data.sessionkey,
    gatewayUrl: parsed.data.GatewayPageURL,
  };
}

// ---------------------------------------------------------------------------
// Order Validation + Transaction Query
// ---------------------------------------------------------------------------

/**
 * The Validation / Query response shape. Unknown fields are
 * stripped by zod — card_no is never read here (it is a wallet
 * reference for mobile banking, not something this shop stores or
 * logs). Fields are optional: an INVALID_TRANSACTION response may
 * carry almost nothing.
 */
const sslcommerzTransactionSchema = z.object({
  status: z.string(),
  tran_id: z.string().optional(),
  val_id: z.string().optional(),
  amount: z.string().optional(),
  store_amount: z.string().optional(),
  currency: z.string().optional(),
  bank_tran_id: z.string().optional(),
  card_brand: z.string().optional(),
  card_type: z.string().optional(),
  risk_level: z.string().optional(),
});

export type SslcommerzTransaction = z.infer<
  typeof sslcommerzTransactionSchema
>;

/**
 * Call the Order Validation API with a val_id (from an IPN or a
 * success return). Returns the parsed response — the caller checks
 * it with checkSslcommerzValidation. Throws SslcommerzError on a
 * network / HTTP / parse failure (that is "cannot verify", not
 * "invalid").
 */
export async function validateSslcommerzTransaction(
  valId: string,
): Promise<SslcommerzTransaction> {
  const config = getSslcommerzConfig();
  if (!config) {
    throw new SslcommerzError("Online payment is not configured.");
  }
  const url =
    `${config.baseUrl}/validator/api/validationserverAPI.php` +
    `?val_id=${encodeURIComponent(valId)}` +
    `&store_id=${encodeURIComponent(config.storeId)}` +
    `&store_passwd=${encodeURIComponent(config.storePassword)}` +
    `&format=json`;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(SSLCOMMERZ_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SslcommerzError(
      "Could not verify the payment. Please try again in a few minutes.",
    );
  }
  if (!response.ok) {
    throw new SslcommerzError(
      "Could not verify the payment. Please try again in a few minutes.",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new SslcommerzError("Could not verify the payment.");
  }
  const parsed = sslcommerzTransactionSchema.safeParse(data);
  if (!parsed.success) {
    throw new SslcommerzError("Could not verify the payment.");
  }
  return parsed.data;
}

/**
 * Call the Transaction Query API by tran_id (the order reference).
 * The fallback when an IPN says FAILED / CANCELLED — the Validation
 * API cannot confirm a failed transaction, so the query is what
 * proves it really failed at the gateway. The documented response
 * is a bare transaction object; older guides show it wrapped in an
 * `element` array, so both shapes are accepted.
 */
export async function querySslcommerzTransaction(
  tranId: string,
): Promise<SslcommerzTransaction> {
  const config = getSslcommerzConfig();
  if (!config) {
    throw new SslcommerzError("Online payment is not configured.");
  }
  const url =
    `${config.baseUrl}/validator/api/merchantTransIDvalidationAPI.php` +
    `?tran_id=${encodeURIComponent(tranId)}` +
    `&store_id=${encodeURIComponent(config.storeId)}` +
    `&store_passwd=${encodeURIComponent(config.storePassword)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(SSLCOMMERZ_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SslcommerzError(
      "Could not verify the payment. Please try again in a few minutes.",
    );
  }
  if (!response.ok) {
    throw new SslcommerzError(
      "Could not verify the payment. Please try again in a few minutes.",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new SslcommerzError("Could not verify the payment.");
  }
  const record =
    data !== null &&
    typeof data === "object" &&
    "element" in data &&
    Array.isArray((data as { element?: unknown }).element) &&
    (data as { element: unknown[] }).element.length > 0
      ? (data as { element: unknown[] }).element[0]
      : data;
  const parsed = sslcommerzTransactionSchema.safeParse(record);
  if (!parsed.success) {
    throw new SslcommerzError("Could not verify the payment.");
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Verdict — the security rule, pure and testable
// ---------------------------------------------------------------------------

export interface SslcommerzGatewayRecord {
  valId: string;
  bankTranId: string | null;
  cardBrand: string | null;
  storeAmountBdt: number | null;
  riskLevel: number | null;
}

export interface SslcommerzValidationVerdict {
  /** True only when the transaction is proven paid for this order. */
  paid: boolean;
  /** Plain-words reason when not paid — safe to log. */
  reason: string;
  /** Gateway fields to store, present only when paid. */
  gateway: SslcommerzGatewayRecord | null;
}

/**
 * Check a Validation API response against our own order. ALL THREE
 * must match before the payment counts as proven (the docs' rule):
 * the status is VALID or VALIDATED, the tran_id is this order's
 * reference, the amount equals our order total, and the currency
 * is BDT. Anything else — including a forged val_id or a tampered
 * amount — is not paid, full stop.
 */
export function checkSslcommerzValidation(
  data: SslcommerzTransaction,
  expected: { reference: string; totalBdt: number },
): SslcommerzValidationVerdict {
  const notPaid = (reason: string): SslcommerzValidationVerdict => ({
    paid: false,
    reason,
    gateway: null,
  });

  if (data.status !== "VALID" && data.status !== "VALIDATED") {
    return notPaid(`validation status is ${data.status}`);
  }
  if (data.tran_id !== expected.reference) {
    return notPaid("tran_id does not match the order reference");
  }
  const amount = parseSslcommerzAmount(data.amount);
  if (amount === null || amount !== expected.totalBdt) {
    return notPaid("amount does not match the order total");
  }
  if (data.currency !== "BDT") {
    return notPaid("currency is not BDT");
  }
  if (!data.val_id) {
    return notPaid("validation response has no val_id");
  }
  return {
    paid: true,
    reason: "valid",
    gateway: {
      valId: data.val_id,
      bankTranId: data.bank_tran_id ?? null,
      cardBrand: data.card_brand ?? null,
      storeAmountBdt: parseSslcommerzAmount(data.store_amount),
      riskLevel:
        data.risk_level === undefined
          ? null
          : Number.isNaN(Number(data.risk_level))
            ? null
            : Number(data.risk_level),
    },
  };
}

/**
 * Map a gateway transaction status to what it means for the order.
 * EXPIRED / UNATTEMPTED / INVALID_TRANSACTION deliberately map to
 * "unknown" — never to failed: an expired session may still be
 * paid late, and an unattempted one means the customer has not
 * tried yet. Only FAILED / CANCELLED are terminal gateway
 * outcomes; only VALID / VALIDATED prove payment.
 */
export function sslcommerzStatusOutcome(
  status: string,
): "paid" | "failed" | "unknown" {
  if (status === "VALID" || status === "VALIDATED") {
    return "paid";
  }
  if (status === "FAILED" || status === "CANCELLED") {
    return "failed";
  }
  return "unknown";
}
