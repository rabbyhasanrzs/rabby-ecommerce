import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin data layer — Slice B (S-4, T-41–T-46).
 *
 * Every function here is server-side only and assumes the caller has
 * already passed requireAdmin() (the (protected) layout does that on
 * every request). Reads/writes go through Slice A's createAdminClient()
 * — the admin's own JWT. RLS is_admin() policies (migration 0005) let
 * it read/write products, product_variants, product_images,
 * product_measurements, categories, site_settings and discount_codes.
 * It CANNOT read orders / order_items / order_status_events / payments
 * (no policies on those tables) — order data goes ONLY through the
 * admin_* SECURITY DEFINER RPCs below, which check is_admin()
 * server-side.
 *
 * The client is cast to the untyped SupabaseClient on purpose: the
 * exact Database generic Slice A uses is not this slice's contract,
 * and these table/RPC names must keep working regardless of it.
 * No elevated service key is used anywhere. Sender numbers ARE
 * returned by admin_get_order (the admin needs them) but no admin
 * page renders them — the UI shows the TrxID only.
 */

// ---------------------------------------------------------------------------
// Client + RPC plumbing
// ---------------------------------------------------------------------------

/**
 * The admin client, untyped so table/RPC names resolve either way.
 * NOTE: Slice A's createAdminClient() is async (it reads the
 * session cookies) — every caller awaits this helper.
 */
export async function adminClient(): Promise<SupabaseClient> {
  return (await createAdminClient()) as unknown as SupabaseClient;
}

/** requireAdmin() re-exported so pages/routes import from one place. */
export { requireAdmin };

export type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Call an admin_* RPC. The functions return their payload directly
 * (a jsonb array / object), or { ok:false, error } for a rejected
 * call — both shapes are unwrapped here. A PostgREST error throws.
 */
export async function callAdminRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    throw new Error(`Admin request failed (${name}). Please try again.`);
  }
  if (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "ok" in data
  ) {
    const wrapped = data as { ok?: unknown; error?: unknown };
    if (wrapped.ok === false) {
      return {
        ok: false,
        error:
          typeof wrapped.error === "string" ? wrapped.error : "forbidden",
      };
    }
    return { ok: true, data: data as T };
  }
  return { ok: true, data: data as T };
}

// ---------------------------------------------------------------------------
// Types (match the Slice A RPC contract exactly)
// ---------------------------------------------------------------------------

export interface AdminOrderSummary {
  id: string;
  reference: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  address: string;
  zone: string;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  total_bdt: number;
  status: string;
  created_at: string;
}

export interface AdminOrderItem {
  slug: string;
  name: string;
  price_bdt: number;
  variant_colour: string | null;
  quantity: number;
}

export interface AdminStatusEvent {
  status: string;
  note: string | null;
  created_at: string;
}

export interface AdminOrder {
  id: string;
  reference: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  address: string;
  zone: string;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  total_bdt: number;
  subtotal_bdt: number | null;
  tax_bdt: number | null;
  delivery_fee_bdt: number | null;
  /** S-7: applied coupon code + Taka discount, from admin_get_order
   *  (migration 0009). Null / 0 when no coupon was applied. */
  discount_code: string | null;
  discount_bdt: number | null;
  status: string;
  created_at: string;
}

export interface AdminOrderDetail {
  order: AdminOrder;
  items: AdminOrderItem[];
  status_events: AdminStatusEvent[];
  /** The sender number IS returned by admin_get_order (the admin
   *  needs it) — it is deliberately never rendered by any admin
   *  page; the UI shows the TrxID only (S-6, T-61, S6-23 corrected
   *  the old comment, which wrongly claimed it was not returned). */
  payment: {
    method: string;
    status: string;
    reference: string | null;
    sender: string | null;
  } | null;
}

export interface AdminCustomer {
  phone: string;
  name: string;
  email: string | null;
  order_count: number;
  total_spent_bdt: number;
  last_order_at: string;
}

export interface AdminDashboardStats {
  orders_to_fulfil: number;
  low_stock_count: number;
  new_orders_7d: number;
  recent_orders: AdminOrderSummary[];
  low_stock: { slug: string; name: string; stock_total: number }[];
}

export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category_id: string | null;
  price_bdt: number;
  stock_total: number;
  status: string;
  is_demo: boolean;
  created_at: string;
  categories: { slug: string; name: string } | null;
}

export interface AdminCategoryRow {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

/** One review row for the admin moderation queue (S-7, T-70). */
export interface AdminReview {
  id: string;
  product_id: string;
  product_name: string | null;
  product_slug: string | null;
  order_reference: string;
  reviewer_name: string;
  rating: number;
  quality_rating: number | null;
  value_rating: number | null;
  fit_rating: number | null;
  body: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

// ---------------------------------------------------------------------------
// Order RPCs (the ONLY path to order data)
// ---------------------------------------------------------------------------

export async function adminListOrders(
  status: string | null,
  limit = 50,
  offset = 0,
): Promise<AdminOrderSummary[]> {
  const result = await callAdminRpc<AdminOrderSummary[]>(
    "admin_list_orders",
    { p_status: status, p_limit: limit, p_offset: offset },
  );
  if (!result.ok) {
    throw new Error("Could not load orders.");
  }
  return result.data ?? [];
}

export async function adminGetOrder(
  reference: string,
): Promise<AdminOrderDetail | null> {
  const result = await callAdminRpc<AdminOrderDetail>("admin_get_order", {
    p_reference: reference,
  });
  if (!result.ok) {
    if (result.error === "not_found") {
      return null;
    }
    throw new Error("Could not load this order.");
  }
  return result.data;
}

export async function adminListCustomers(): Promise<AdminCustomer[]> {
  const result = await callAdminRpc<AdminCustomer[]>(
    "admin_list_customers",
    {},
  );
  if (!result.ok) {
    throw new Error("Could not load customers.");
  }
  return result.data ?? [];
}

export async function adminDashboardStats(): Promise<AdminDashboardStats> {
  const result = await callAdminRpc<AdminDashboardStats>(
    "admin_dashboard_stats",
    {},
  );
  if (!result.ok) {
    throw new Error("Could not load the dashboard.");
  }
  return result.data;
}

export async function adminUpdateOrderStatus(
  reference: string,
  status: string,
  note: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const result = await callAdminRpc<{ ok: boolean; error?: string }>(
    "admin_update_order_status",
    { p_reference: reference, p_status: status, p_note: note },
  );
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  if (result.data && typeof result.data === "object" && "ok" in result.data) {
    return result.data as { ok: boolean; error?: string };
  }
  return { ok: true };
}

/**
 * Notification log write (S-7, 1.x-4 — migration 0012).
 *
 * One row in notification_log per order email attempt, via
 * the SECURITY DEFINER log_notification function (the table itself
 * has no policies and no grants — deny-by-default, same as
 * order_status_events). NEVER throws: a failed log write must never
 * fail the status update or turn a sent email into a failed one —
 * the log is an audit trail, not part of the update.
 *
 * The recipient email is stored in the admin-only table (the owner
 * asked for it there) — never in a console log.
 */
export async function logNotificationAttempt(input: {
  orderReference: string;
  type: "order_status" | "back_in_stock" | "payment_failed";
  status: string;
  recipient: string | null;
  result: "sent" | "failed" | "skipped";
  error?: string | null;
}): Promise<void> {
  try {
    await callAdminRpc("log_notification", {
      p_order_reference: input.orderReference,
      p_type: input.type,
      p_status: input.status,
      p_recipient: input.recipient,
      p_result: input.result,
      p_error: input.error ?? null,
    });
  } catch {
    // Best-effort audit log — see above.
  }
}

export async function adminUpdatePaymentStatus(
  reference: string,
  status: "paid" | "failed",
): Promise<{ ok: boolean; error?: string }> {
  const result = await callAdminRpc<{ ok: boolean; error?: string }>(
    "admin_update_payment_status",
    { p_reference: reference, p_status: status },
  );
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  if (result.data && typeof result.data === "object" && "ok" in result.data) {
    return result.data as { ok: boolean; error?: string };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Back-in-stock alert subscriptions (S-7 — migration 0013). The table
// is admin-only (RLS deny-by-default, no policies); reads/writes go
// through the SECURITY DEFINER functions below, which check
// is_admin() server-side. The subscriber email is personal data
// with one purpose — it is returned here for the admin list only,
// never rendered on a customer-facing page.
// ---------------------------------------------------------------------------

export interface AdminStockAlertSubscription {
  id: string;
  product_id: string;
  product_slug: string;
  product_name: string;
  email: string;
  status: "pending" | "sent" | "unsubscribed";
  created_at: string;
  sent_at: string | null;
}

/**
 * Subscriptions for the admin list — newest first, capped at 500
 * by the function. Null filters mean "all". Throws when the
 * function rejects (e.g. migration 0013 not run yet) — callers
 * that render a page catch that and show the setup message.
 */
export async function adminListStockAlertSubscriptions(
  productId: string | null,
  status: AdminStockAlertSubscription["status"] | null,
): Promise<AdminStockAlertSubscription[]> {
  const result = await callAdminRpc<AdminStockAlertSubscription[]>(
    "list_stock_alert_subscriptions",
    { p_product_id: productId, p_status: status },
  );
  if (!result.ok) {
    throw new Error("Could not load stock alert subscriptions.");
  }
  return result.data ?? [];
}

/**
 * Atomically claim pending subscriptions for sending — flips the
 * given rows from 'pending' to 'sent' and returns only the rows
 * that were still 'pending', each with its email + unsubscribe
 * token. Used by the inventory restock trigger (see
 * lib/order-email.ts sendBackInStockAlertsForProduct).
 */
export async function adminClaimStockAlerts(
  productId: string,
  ids: string[],
): Promise<
  Array<{ id: string; email: string; unsubscribeToken: string }>
> {
  const result = await callAdminRpc<
    Array<{ id: string; email: string; unsubscribe_token: string }>
  >("mark_stock_alerts_sent", {
    p_product_id: productId,
    p_ids: ids,
  });
  if (!result.ok) {
    throw new Error("Could not send stock alerts.");
  }
  return (result.data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    unsubscribeToken: row.unsubscribe_token,
  }));
}

// ---------------------------------------------------------------------------
// Order status workflow (7 steps + terminal states)
// ---------------------------------------------------------------------------

// The free-movement target lists live in lib/order-status-targets.ts
// (pure module, no server-only imports) and are re-exported here so
// server code keeps one import. S-6 follow-up D-S6-3 replaced the
// old next-only NEXT_STATUSES / allowedNextStatuses: the admin may
// now jump to any target the server accepts. NOTE: the old comment
// above NEXT_STATUSES wrongly claimed the RPC rejects moves out of
// delivered — it does not. The RPC (migration 0005,
// admin_update_order_status) accepts ANY valid status and only
// rejects invalid status strings and transitions OUT of the terminal
// statuses cancelled / failed / refunded. Delivered -> Returned is
// the return path, not a rejected move.
export {
  ALLOWED_TARGET_STATUSES,
  allowedTargetStatuses,
} from "@/lib/order-status-targets";

export const ORDER_STATUS_LABELS: Record<string, string> = {
  placed: "Placed",
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

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

// ---------------------------------------------------------------------------
// Products / categories / inventory (direct table access, RLS is_admin)
// ---------------------------------------------------------------------------

export async function adminListProducts(): Promise<AdminProductRow[]> {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,slug,name,description,category_id,price_bdt,stock_total,status,is_demo,created_at,categories(slug,name)",
    )
    .order("name", { ascending: true });
  if (error || !data) {
    throw new Error("Could not load products.");
  }
  return data as unknown as AdminProductRow[];
}

export async function adminGetProduct(
  id: string,
): Promise<{
  product: AdminProductRow;
  colour: string | null;
  imageUrl: string | null;
} | null> {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,slug,name,description,category_id,price_bdt,stock_total,status,is_demo,created_at,categories(slug,name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load this product.");
  }
  if (!data) {
    return null;
  }
  const product = data as unknown as AdminProductRow;
  const [variantsRes, imagesRes] = await Promise.all([
    supabase
      .from("product_variants")
      .select("colour")
      .eq("product_id", id)
      .order("sort_order", { ascending: true })
      .limit(1),
    supabase
      .from("product_images")
      .select("storage_path")
      .eq("product_id", id)
      .eq("is_primary", true)
      .order("sort_order", { ascending: true })
      .limit(1),
  ]);
  const colour =
    (variantsRes.data?.[0] as { colour?: string } | undefined)?.colour ??
    null;
  const imageUrl =
    (imagesRes.data?.[0] as { storage_path?: string } | undefined)
      ?.storage_path ?? null;
  return { product, colour, imageUrl };
}

export async function adminListCategories(): Promise<AdminCategoryRow[]> {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id,slug,name,sort_order,is_active")
    .order("sort_order", { ascending: true });
  if (error || !data) {
    throw new Error("Could not load categories.");
  }
  return data as AdminCategoryRow[];
}

// ---------------------------------------------------------------------------
// Review moderation (S-7, T-70) — direct table reads through the admin
// client (RLS reviews_admin_all, migration 0010), the same pattern as
// adminListProducts. Orders stay RPC-only; reviews are admin-owned
// data like products, so no RPC is needed here.
// ---------------------------------------------------------------------------

const REVIEW_STATUS_ORDER: Record<AdminReview["status"], number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

/** Reviews for the moderation queue — pending first, newest first within a status. */
export async function adminListReviews(
  status: AdminReview["status"] | null,
): Promise<AdminReview[]> {
  const supabase = await adminClient();
  let query = supabase
    .from("reviews")
    .select(
      "id,product_id,order_reference,reviewer_name,rating,quality_rating,value_rating,fit_rating,body,status,created_at,products(name,slug)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== null) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error || !data) {
    throw new Error("Could not load reviews.");
  }
  const rows = (data as unknown as Array<{
    id: string;
    product_id: string;
    order_reference: string;
    reviewer_name: string;
    rating: number;
    quality_rating: number | null;
    value_rating: number | null;
    fit_rating: number | null;
    body: string;
    status: string;
    created_at: string;
    products: { name: string; slug: string } | null;
  }>).map((row) => ({
    id: row.id,
    product_id: row.product_id,
    product_name: row.products?.name ?? null,
    product_slug: row.products?.slug ?? null,
    order_reference: row.order_reference,
    reviewer_name: row.reviewer_name,
    rating: row.rating,
    quality_rating: row.quality_rating,
    value_rating: row.value_rating,
    fit_rating: row.fit_rating,
    body: row.body,
    status: row.status as AdminReview["status"],
    created_at: row.created_at,
  }));
  // Pending first — the queue is the work, not the archive.
  return rows.sort(
    (a, b) =>
      REVIEW_STATUS_ORDER[a.status] - REVIEW_STATUS_ORDER[b.status] ||
      b.created_at.localeCompare(a.created_at),
  );
}

// slugifyName lives in lib/slugify.ts (pure, client-safe, no regex —
// see that file) and is re-exported here so API routes keep one import.

export { slugifyName } from "@/lib/slugify";

// ---------------------------------------------------------------------------
// Validation schemas live in ./admin-schemas (client-safe, pure Zod)
// and are re-exported here so API routes keep one import. The client
// product form imports them from ./admin-schemas directly — it must
// never import this file, which pulls in the server-only Supabase
// admin client (next/headers) and would break the client bundle.
// ---------------------------------------------------------------------------

export {
  categorySaveSchema,
  inventorySaveSchema,
  orderStatusUpdateSchema,
  paymentStatusUpdateSchema,
  productSaveSchema,
} from "./admin-schemas";
export type { ProductSaveInput } from "./admin-schemas";
