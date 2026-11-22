import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sales & Revenue analytics — server-side data layer (S-4, T-49).
 *
 * Every function calls a Slice A SECURITY DEFINER RPC
 * (migration 0005) through the admin's own JWT client. The RPCs
 * check is_admin() first and return { ok:false, error:"forbidden" }
 * to a non-admin — a forbidden result throws here, so the analytics
 * page can render its graceful "unavailable" state instead of data.
 * Real order data ONLY: revenue counts non-cancelled orders
 * (Cancelled / Failed / Refunded are excluded by the SQL), days
 * with no orders come back as 0, and an empty period returns
 * empty arrays / zeros — numbers are never invented here.
 *
 * Slice B's Dashboard imports getRevenueSeries for its sparkline —
 * the signatures below are the contract; do not change them.
 *
 * (Replaces Slice B's temporary verification stub, which returned
 * all-zero series so the Dashboard could be built in parallel.)
 */

export type AnalyticsPeriod = 7 | 14 | 30;

export interface RevenuePoint {
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  revenueBdt: number;
  orders: number;
}

export interface BestSeller {
  slug: string;
  name: string;
  qty: number;
  revenueBdt: number;
}

export interface SalesSummary {
  revenueBdt: number;
  orders: number;
  avgOrderBdt: number;
}

/** The admin client, untyped so RPC names resolve regardless of the
 *  Database generic Slice A uses (same pattern as Slice B's
 *  admin-data.ts). createAdminClient() is async — await it. */
async function adminClient(): Promise<SupabaseClient> {
  return (await createAdminClient()) as unknown as SupabaseClient;
}

/**
 * Call an admin_* analytics RPC. The functions return their payload
 * directly (a jsonb array / object), or { ok:false, error } for a
 * rejected call — both shapes are unwrapped here. A PostgREST error
 * or a forbidden result throws a plain-words error.
 */
async function callAnalyticsRpc<T>(
  name: string,
  days: AnalyticsPeriod,
): Promise<T> {
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc(name, { p_days: days });
  if (error) {
    throw new Error("Could not load sales data. Please try again.");
  }
  if (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "ok" in data
  ) {
    const wrapped = data as { ok?: unknown; error?: unknown };
    if (wrapped.ok === false) {
      throw new Error("Could not load sales data. Please try again.");
    }
  }
  return data as T;
}

interface RevenueSeriesRow {
  day?: unknown;
  revenue_bdt?: unknown;
  orders?: unknown;
}

interface BestSellerRow {
  slug?: unknown;
  name?: unknown;
  qty?: unknown;
  revenue_bdt?: unknown;
}

interface SalesSummaryRow {
  revenue_bdt?: unknown;
  orders?: unknown;
  avg_order_bdt?: unknown;
}

function toInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : 0;
}

function toDayString(value: unknown): string {
  // generate_series returns a timestamp, so the day arrives as an
  // ISO string ("2026-11-22T00:00:00"); keep the calendar date only.
  return typeof value === "string" ? value.slice(0, 10) : "";
}

/**
 * Revenue + order counts per day for the last `days` days, oldest
 * first. Days with no orders are 0 (the SQL fills them in).
 */
export async function getRevenueSeries(
  days: AnalyticsPeriod,
): Promise<RevenuePoint[]> {
  const rows = await callAnalyticsRpc<RevenueSeriesRow[]>(
    "admin_revenue_series",
    days,
  );
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => ({
    date: toDayString(row.day),
    revenueBdt: toInt(row.revenue_bdt),
    orders: toInt(row.orders),
  }));
}

/** Top 10 products by revenue over the last `days` days. */
export async function getBestSellers(
  days: AnalyticsPeriod,
): Promise<BestSeller[]> {
  const rows = await callAnalyticsRpc<BestSellerRow[]>(
    "admin_best_sellers",
    days,
  );
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => ({
    slug: typeof row.slug === "string" ? row.slug : "",
    name: typeof row.name === "string" ? row.name : "",
    qty: toInt(row.qty),
    revenueBdt: toInt(row.revenue_bdt),
  }));
}

/** Summary totals over the last `days` days (avg is 0 with no orders). */
export async function getSalesSummary(
  days: AnalyticsPeriod,
): Promise<SalesSummary> {
  const row = await callAnalyticsRpc<SalesSummaryRow>(
    "admin_sales_summary",
    days,
  );
  if (!row || typeof row !== "object") {
    return { revenueBdt: 0, orders: 0, avgOrderBdt: 0 };
  }
  return {
    revenueBdt: toInt(row.revenue_bdt),
    orders: toInt(row.orders),
    avgOrderBdt: toInt(row.avg_order_bdt),
  };
}
