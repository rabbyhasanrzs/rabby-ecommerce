import type { CheckoutFormData } from "@/lib/checkout-validation";
import type {
  DeliveryZone,
  PaymentMethodId,
} from "@/lib/demo-config";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Order shapes (S-2) — returned by the server-side lookup API and
 * rendered by the confirmation + track-order pages. Orders are NEVER
 * readable by the anon key (RLS deny-by-default, migration 0003);
 * lookup is server-side, by reference + phone, through the
 * SECURITY DEFINER functions.
 *
 * The server helpers (rpc wrappers) are appended to this file by the
 * S-2 API work; the types and step constants below are the contract
 * both the API routes and the pages code against.
 */

export interface OrderItemDetail {
  productSlug: string;
  productName: string;
  variantColour: string | null;
  unitPriceBdt: number;
  quantity: number;
  lineTotalBdt: number;
}

export interface OrderStatusEvent {
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
}

export interface OrderDetail {
  reference: string;
  status: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  deliveryZone: DeliveryZone;
  paymentMethod: PaymentMethodId;
  /**
   * S-3 payment state. Optional (not required) so order fixtures
   * written before S-3 still typecheck: lookupOrder always populates
   * them (falling back to a method-derived status when the database
   * predates migration 0004), and the pages render through
   * paymentStatusLabel below, which treats a missing status the same
   * way. paymentSender is carried for the server/API layer only —
   * the pages never render it (TrxID only).
   */
  paymentStatus?: string;
  paymentReference?: string | null;
  paymentSender?: string | null;
  subtotalBdt: number;
  taxBdt: number;
  deliveryFeeBdt: number;
  totalBdt: number;
  createdAt: string;
  items: OrderItemDetail[];
  events: OrderStatusEvent[];
}

/**
 * Plain-words payment status for the confirmation + track-order
 * pages (S-3). A missing status (pre-0004 row) is derived from the
 * method: COD orders pay on delivery, everything else is pending
 * verification.
 */
export function paymentStatusLabel(
  paymentStatus: string | undefined,
  paymentMethod: string,
): string {
  const status =
    paymentStatus ?? (paymentMethod === "cod" ? "cod" : "pending");
  switch (status) {
    case "cod":
      return "Cash on Delivery — pay when your order arrives";
    case "pending":
      return "Payment pending verification";
    case "paid":
      return "Paid";
    case "failed":
      return "Payment failed";
    default:
      return "Payment pending verification";
  }
}

/** True for the mobile-banking methods (TrxID + sender number). */
export function isMobileBankingMethod(paymentMethod: string): boolean {
  return (
    paymentMethod === "bkash" ||
    paymentMethod === "nagad" ||
    paymentMethod === "rocket"
  );
}

/** The 7-step order workflow (Gap Resolution, approved 2026-11-17). */
export const ORDER_STEPS = [
  "placed",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;

export const ORDER_STEP_LABELS: Record<string, string> = {
  placed: "Order Placed",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
  returned: "Returned",
  refunded: "Refunded",
};

/** A customer may cancel only before the order ships. */
export function isCancellableStatus(status: string): boolean {
  return ["placed", "confirmed", "processing", "packed"].includes(status);
}

/** Order reference: RB-2026- + 6 random digits (unguessable, never sequential). */
export const ORDER_REFERENCE_PATTERN = /^RB-2026-\d{6}$/;

export function isValidOrderReference(reference: string): boolean {
  return ORDER_REFERENCE_PATTERN.test(reference.trim());
}

export type { DeliveryZone, PaymentMethodId };

// ---------------------------------------------------------------------------
// Server helpers (S-2 API routes) — anon client + SECURITY DEFINER rpc.
//
// The anon key has NO direct access to orders / order_items /
// order_status_events (RLS deny-by-default, migration 0003, no policies).
// Every helper below calls a SECURITY DEFINER Postgres function, which
// runs as the table owner and is the ONLY path that reads or writes
// orders. No service_role key is used anywhere — the local .env.local
// does not even contain one.
// ---------------------------------------------------------------------------

/** Thrown when the Supabase env vars are missing. Routes turn this into 503. */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase is not configured");
    this.name = "SupabaseNotConfiguredError";
  }
}

function requireClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new SupabaseNotConfiguredError();
  }
  return supabase;
}

/**
 * Failure from createGuestOrder, mapped from the Postgres RAISE messages
 * in migration 0003. Routes map the code to a status:
 *   INSUFFICIENT_STOCK / NOT_FOUND -> 422 (bag no longer valid)
 *   VALIDATION                      -> 400 (bad customer/items input)
 * Anything else is a plain Error and becomes a 500.
 */
export class GuestOrderError extends Error {
  readonly code: "INSUFFICIENT_STOCK" | "NOT_FOUND" | "VALIDATION";
  /** The product slug from an insufficient_stock:/product_not_found: message. */
  readonly slug?: string;

  constructor(
    code: GuestOrderError["code"],
    message: string,
    slug?: string,
  ) {
    super(message);
    this.name = "GuestOrderError";
    this.code = code;
    this.slug = slug;
  }
}

/** Map a PostgREST rpc error to a GuestOrderError, or null when it is not a known validation failure. */
function mapCreateOrderError(error: { message?: string }): GuestOrderError | null {
  const message = error.message ?? "";
  if (message.startsWith("insufficient_stock:")) {
    return new GuestOrderError(
      "INSUFFICIENT_STOCK",
      "Some items are no longer available.",
      message.slice("insufficient_stock:".length),
    );
  }
  if (message.startsWith("product_not_found:")) {
    return new GuestOrderError(
      "NOT_FOUND",
      "Some items are no longer available.",
      message.slice("product_not_found:".length),
    );
  }
  if (message.startsWith("payment_method_disabled")) {
    return new GuestOrderError(
      "VALIDATION",
      "This payment method is currently unavailable. Please choose another.",
    );
  }
  if (message.startsWith("invalid_")) {
    return new GuestOrderError(
      "VALIDATION",
      "Please check your details and try again.",
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bag validation (POST /api/bag/validate)
// ---------------------------------------------------------------------------

export interface BagValidateItemInput {
  slug: string;
  quantity: number;
  priceBdt?: number;
}

export interface BagValidateItem {
  slug: string;
  name: string;
  priceBdt: number;
  stockTotal: number;
  quantity: number;
  available: boolean;
  lineTotalBdt: number;
}

export type BagIssueType =
  | "not_found"
  | "out_of_stock"
  | "quantity_reduced"
  | "price_changed";

export interface BagIssue {
  slug: string;
  type: BagIssueType;
  message: string;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  price_bdt: number;
  stock_total: number;
  status: string;
}

/**
 * Re-validate bag lines against live catalogue data. Prices always come
 * from the DB — a client-sent priceBdt is only compared, never trusted.
 * A line with quantity > stock is clamped to stock (quantity_reduced);
 * a line with no stock is unavailable (out_of_stock); a line whose
 * product is gone or inactive is unavailable (not_found).
 */
export async function validateBagItems(
  items: BagValidateItemInput[],
): Promise<{ items: BagValidateItem[]; issues: BagIssue[] }> {
  const supabase = requireClient();

  const slugs = [...new Set(items.map((item) => item.slug))];
  const { data, error } = await supabase
    .from("products")
    .select("id,slug,name,price_bdt,stock_total,status")
    .in("slug", slugs)
    .eq("status", "active");
  if (error || !data) {
    throw new Error("Failed to validate bag. Please try again.");
  }

  const bySlug = new Map(
    (data as ProductRow[]).map((row) => [row.slug, row]),
  );

  const outItems: BagValidateItem[] = [];
  const issues: BagIssue[] = [];

  for (const item of items) {
    const row = bySlug.get(item.slug);
    if (!row) {
      issues.push({
        slug: item.slug,
        type: "not_found",
        message: "This item is no longer available.",
      });
      outItems.push({
        slug: item.slug,
        name: item.slug,
        priceBdt: item.priceBdt ?? 0,
        stockTotal: 0,
        quantity: item.quantity,
        available: false,
        lineTotalBdt: (item.priceBdt ?? 0) * item.quantity,
      });
      continue;
    }

    const priceBdt = row.price_bdt;
    let quantity = item.quantity;
    let available = true;

    if (row.stock_total <= 0) {
      issues.push({
        slug: item.slug,
        type: "out_of_stock",
        message: `${row.name} is out of stock.`,
      });
      quantity = 0;
      available = false;
    } else if (item.quantity > row.stock_total) {
      issues.push({
        slug: item.slug,
        type: "quantity_reduced",
        message: `Only ${row.stock_total} left in stock for ${row.name}. Quantity reduced.`,
      });
      quantity = row.stock_total;
    }

    if (item.priceBdt !== undefined && item.priceBdt !== priceBdt) {
      issues.push({
        slug: item.slug,
        type: "price_changed",
        message: `The price of ${row.name} has changed.`,
      });
    }

    outItems.push({
      slug: item.slug,
      name: row.name,
      priceBdt,
      stockTotal: row.stock_total,
      quantity,
      available,
      lineTotalBdt: priceBdt * quantity,
    });
  }

  return { items: outItems, issues };
}

// ---------------------------------------------------------------------------
// Guest order create / lookup / cancel (POST /api/checkout,
// POST /api/orders/lookup, POST /api/orders/cancel)
// ---------------------------------------------------------------------------

export interface CreateGuestOrderInput {
  customer: CheckoutFormData;
  items: { slug: string; variantColour: string | null; quantity: number }[];
}

/** Create the order transactionally via create_guest_order (migration 0004, 5 arguments). */
export async function createGuestOrder(
  input: CreateGuestOrderInput,
): Promise<{ reference: string; totalBdt: number }> {
  const supabase = requireClient();

  const { data, error } = await supabase.rpc("create_guest_order", {
    p_customer: {
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email,
      address: input.customer.address,
      zone: input.customer.zone,
    },
    p_payment_method: input.customer.paymentMethod,
    // S-3: mobile-banking TrxID + sender number (null for COD/card).
    // The SQL function ignores them for COD/card and validates them
    // for bkash/nagad/rocket; 'invalid_payment_reference' /
    // 'invalid_payment_sender' map to VALIDATION via mapCreateOrderError
    // (they start with "invalid_").
    p_payment_reference: input.customer.paymentReference ?? null,
    p_payment_sender: input.customer.paymentSender ?? null,
    p_items: input.items.map((item) => ({
      slug: item.slug,
      variant_colour: item.variantColour,
      quantity: item.quantity,
    })),
  });
  if (error) {
    const mapped = mapCreateOrderError(error);
    if (mapped) {
      throw mapped;
    }
    throw new Error("Order could not be created. Please try again.");
  }

  const result = data as { reference?: unknown; total_bdt?: unknown } | null;
  if (
    !result ||
    typeof result.reference !== "string" ||
    typeof result.total_bdt !== "number"
  ) {
    throw new Error("Order could not be created. Please try again.");
  }
  return { reference: result.reference, totalBdt: result.total_bdt };
}

interface LookupOrderRow {
  reference: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  delivery_address: string;
  delivery_zone: string;
  payment_method: string;
  /** S-3 (migration 0004). Absent on rows returned by the pre-0004
   *  lookup function — the mapping below falls back accordingly. */
  payment_status?: string;
  payment_reference?: string | null;
  payment_sender?: string | null;
  subtotal_bdt: number;
  tax_bdt: number;
  delivery_fee_bdt: number;
  total_bdt: number;
  created_at: string;
  items: {
    product_slug: string;
    product_name: string;
    variant_colour: string | null;
    unit_price_bdt: number;
    quantity: number;
    line_total_bdt: number;
  }[];
  events: {
    from_status: string | null;
    to_status: string;
    created_at: string;
  }[];
}

/** Look one order up by reference + phone. Returns null when either does not match. */
export async function lookupOrder(
  reference: string,
  phone: string,
): Promise<OrderDetail | null> {
  const supabase = requireClient();

  const { data, error } = await supabase.rpc("lookup_guest_order", {
    p_reference: reference,
    p_phone: phone,
  });
  if (error) {
    throw new Error("Order lookup failed. Please try again.");
  }
  if (!data) {
    return null;
  }

  const row = data as LookupOrderRow;
  return {
    reference: row.reference,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    deliveryAddress: row.delivery_address,
    deliveryZone: row.delivery_zone as DeliveryZone,
    paymentMethod: row.payment_method as PaymentMethodId,
    paymentStatus:
      row.payment_status ??
      (row.payment_method === "cod" ? "cod" : "pending"),
    paymentReference: row.payment_reference ?? null,
    paymentSender: row.payment_sender ?? null,
    subtotalBdt: row.subtotal_bdt,
    taxBdt: row.tax_bdt,
    deliveryFeeBdt: row.delivery_fee_bdt,
    totalBdt: row.total_bdt,
    createdAt: row.created_at,
    items: (row.items ?? []).map((item) => ({
      productSlug: item.product_slug,
      productName: item.product_name,
      variantColour: item.variant_colour,
      unitPriceBdt: item.unit_price_bdt,
      quantity: item.quantity,
      lineTotalBdt: item.line_total_bdt,
    })),
    events: (row.events ?? []).map((event) => ({
      fromStatus: event.from_status,
      toStatus: event.to_status,
      createdAt: event.created_at,
    })),
  };
}

/** Cancel an order by reference + phone. Stock is restored by the function. */
export async function cancelOrder(
  reference: string,
  phone: string,
): Promise<{ ok: boolean; error?: "not_found" | "too_late" }> {
  const supabase = requireClient();

  const { data, error } = await supabase.rpc("cancel_guest_order", {
    p_reference: reference,
    p_phone: phone,
  });
  if (error) {
    throw new Error("Order cancellation failed. Please try again.");
  }

  const result = (data ?? {}) as { ok?: unknown; error?: unknown };
  if (result.ok === true) {
    return { ok: true };
  }
  if (result.error === "too_late") {
    return { ok: false, error: "too_late" };
  }
  return { ok: false, error: "not_found" };
}

// ---------------------------------------------------------------------------
// Payment status (S-3, Slice B's webhook calls this)
// ---------------------------------------------------------------------------

/**
 * Mark an order's payment status via mark_order_payment_status
 * (migration 0004). Only a 'pending' payment can move — a COD order
 * or one already 'paid' / 'failed' returns invalid_transition.
 * Imported by the webhook route (Slice B); the checkout flow never
 * calls it.
 */
export async function markOrderPaymentStatus(
  reference: string,
  status: "paid" | "failed",
): Promise<{
  ok: boolean;
  error?: "not_found" | "invalid_status" | "invalid_transition";
}> {
  const supabase = requireClient();

  const { data, error } = await supabase.rpc("mark_order_payment_status", {
    p_reference: reference,
    p_status: status,
  });
  if (error) {
    throw new Error("Payment status update failed. Please try again.");
  }

  const result = (data ?? {}) as { ok?: unknown; error?: unknown };
  if (result.ok === true) {
    return { ok: true };
  }
  if (result.error === "not_found") {
    return { ok: false, error: "not_found" };
  }
  if (result.error === "invalid_status") {
    return { ok: false, error: "invalid_status" };
  }
  if (result.error === "invalid_transition") {
    return { ok: false, error: "invalid_transition" };
  }
  throw new Error("Payment status update failed. Please try again.");
}
