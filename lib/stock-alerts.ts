import { getSupabaseClient } from "@/lib/supabase/client";
import { SupabaseNotConfiguredError } from "@/lib/supabase/orders";

/**
 * Back-in-stock alerts data layer — S-7 (no documented scope;
 * owner-approved standard setup, see the S-7 back-in-stock
 * investigation note).
 *
 * The stock_alert_subscriptions table has NO anon policy
 * (admin-only RLS, migration 0013) — the storefront never selects
 * it directly. The subscribe / unsubscribe paths go through
 * SECURITY DEFINER functions, the same pattern as submit_review
 * (0010) and validate_discount_code (0009):
 *
 *   subscribe_stock_alert(p_product_slug, p_email) -> { ok: true }
 *     (or { ok: false, error } for a rejected subscribe; the
 *     already-subscribed case is a no-op that still returns ok, so
 *     no caller can probe whether an email is on the list)
 *   unsubscribe_stock_alert(p_token) -> { ok: true }
 *
 * The subscriber email is personal data with one purpose: it lives
 * in the admin-only table only, never in a console log, never in a
 * customer-facing page. The request schema lives in
 * lib/api-schemas.ts (like every other API route schema).
 */

/**
 * Thrown when subscribe_stock_alert rejects a subscribe (S-7,
 * migration 0013). One plain-words message per case — the route
 * returns it as a 400.
 */
export class StockAlertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockAlertError";
  }
}

function requireClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new SupabaseNotConfiguredError();
  }
  return supabase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Subscribe one email to back-in-stock alerts for one product.
 * Returns { ok: true } both for a new subscription and for an
 * already-subscribed email (the function no-ops on the dedupe) —
 * the route answers both with one shared message. Throws
 * StockAlertError for a rejected subscribe,
 * SupabaseNotConfiguredError when the env vars are missing, and a
 * generic Error for anything else.
 */
export async function subscribeStockAlert(input: {
  productSlug: string;
  email: string;
}): Promise<{ ok: true }> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("subscribe_stock_alert", {
    p_product_slug: input.productSlug,
    p_email: input.email,
  });
  if (error) {
    throw new Error("Your request couldn't be saved. Please try again.");
  }
  if (isRecord(data) && data.ok === false) {
    const code = typeof data.error === "string" ? data.error : "";
    if (code === "product_not_found") {
      throw new StockAlertError("That product couldn't be found.");
    }
    if (code === "product_in_stock") {
      throw new StockAlertError(
        "This product is in stock now — you can order it.",
      );
    }
    if (code === "invalid_email") {
      throw new StockAlertError("Enter a valid email address.");
    }
    throw new StockAlertError(
      "Your request couldn't be saved. Please try again.",
    );
  }
  return { ok: true };
}

/**
 * Unsubscribe with a per-row token (the token IS the secret — no
 * auth). Returns { ok: true } whether or not a row matched, so the
 * route shows one confirmation either way. Throws
 * SupabaseNotConfiguredError when the env vars are missing, and a
 * generic Error for anything else.
 */
export async function unsubscribeStockAlert(
  token: string,
): Promise<{ ok: true }> {
  const supabase = requireClient();
  const { error } = await supabase.rpc("unsubscribe_stock_alert", {
    p_token: token,
  });
  if (error) {
    throw new Error("Your request couldn't be saved. Please try again.");
  }
  return { ok: true };
}
