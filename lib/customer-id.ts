import { createHash } from "node:crypto";
import { normalizePhone } from "@/lib/checkout-validation";

/**
 * Opaque admin customer id (S-6 follow-up, D-S6-4) — no PII in URLs.
 *
 * Mechanism: the id is the first 16 hex characters of the SHA-256 of
 * the NORMALIZED Bangladeshi phone number. The normalizer is
 * normalizePhone from lib/checkout-validation — the same one checkout
 * and the SQL order functions use — so "+8801712345678", "8801712345678"
 * and "01712345678" all map to the same id, and the id is stable for
 * the same customer. No customers table or migration is needed: the
 * server resolves an id back to a customer by hashing each customer's
 * normalized phone and matching (see the [id] customer detail page).
 *
 * The id is opaque — it reveals nothing about the phone on its own —
 * and it is only ever used inside the admin area. It is NOT a secret:
 * anyone who already knows a customer's phone can compute it, which
 * is fine, because the admin area itself is authenticated; the point
 * is that the phone number no longer appears in the URL, browser
 * history, or server logs.
 *
 * node:crypto is fine here — this module is imported only by server
 * components (admin pages) and node-run tests, never by client code.
 */
export const CUSTOMER_ID_HEX_LENGTH = 16;

/** Deterministic opaque id for a customer phone (any accepted form). */
export function customerIdForPhone(rawPhone: string): string {
  return createHash("sha256")
    .update(normalizePhone(rawPhone), "utf8")
    .digest("hex")
    .slice(0, CUSTOMER_ID_HEX_LENGTH);
}

/** True when the value has the shape of a customer id (16 hex chars). */
export function isCustomerId(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${CUSTOMER_ID_HEX_LENGTH}}$`).test(value);
}

/**
 * True when the value looks like a Bangladeshi mobile number, in any
 * accepted form ("01XXXXXXXXX", "8801XXXXXXXXX", "+8801XXXXXXXXX",
 * with spaces / dashes / brackets tolerated). A raw phone as the [id]
 * route param must NEVER resolve — the detail page calls notFound()
 * for phone-shaped params before any lookup, so old
 * /admin/customers/01XXXXXXXXX URLs 404 instead of showing the
 * customer. This cannot misfire on a real id: ids are always 16
 * characters, while every phone form is 11, 13 or 14 characters, and
 * the pattern is anchored to the full string.
 */
export function isPhoneShaped(value: string): boolean {
  const cleaned = value.replace(/[\s\-()]/g, "");
  return /^(?:\+?880|0)1[3-9]\d{8}$/.test(cleaned);
}
