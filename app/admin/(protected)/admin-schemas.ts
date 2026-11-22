import { z } from "zod";

/**
 * Admin validation schemas (S-4) — client-safe, pure Zod.
 *
 * This file deliberately imports NOTHING server-only (no Supabase,
 * no next/headers, no next/navigation): the product form is a client
 * component and imports productSaveSchema from here. The server data
 * layer (admin-data.ts) re-exports these, so the API routes can keep
 * importing from one place — the same rules run on both sides, so a
 * value the form accepts is one the API accepts.
 */

// ---------------------------------------------------------------------------
// Validation — shared by the product form (client) and the API routes
// (server). A product cannot be saved without a price, a photo and
// stock: price_bdt must be a positive integer, stock_total a provided
// integer >= 0, and imageUrl a non-empty URL. (Stock 0 is allowed —
// it means Out of Stock; the field itself must not be missing.)
// ---------------------------------------------------------------------------

export const productSaveSchema = z.object({
  name: z.string().trim().min(2, "Enter a product name.").max(100),
  categoryId: z.string().uuid("Choose a category.").nullable(),
  priceBdt: z
    .number()
    .int("Price must be a whole number of Taka.")
    .min(1, "Enter a price greater than ৳0.")
    // S-6 (T-61, S6-08): an upper bound — a 12-digit price passed
    // Zod and only failed later at the Postgres int insert with a
    // generic 500. ৳1,000,000 matches the catalogue listing's
    // existing price-filter cap (lib/supabase/catalog.ts).
    .max(1000000, "Enter a price of ৳1,000,000 or less."),
  stockTotal: z
    .number()
    .int("Stock must be a whole number.")
    .min(0, "Stock cannot be negative.")
    // S-6 (T-61, S6-08): a generous cap, same reasoning as price.
    .max(100000, "Enter stock of 100,000 or less."),
  status: z.enum(["active", "inactive"]),
  description: z.string().trim().max(2000).optional().default(""),
  colour: z.string().trim().min(1, "Enter a colour.").max(50),
  /**
   * Public URL of the uploaded photo (or the existing photo on edit).
   * S-6 (T-61, S6-08): only a same-origin /images/… path or an
   * https URL on a Supabase Storage host — an arbitrary external URL
   * bypasses the upload route's JPEG/PNG/WebP ≤ 5 MB allowlist and
   * lets a photo hotlink (or track) from anywhere.
   */
  imageUrl: z
    .string()
    .trim()
    .min(1, "Upload a product photo.")
    .refine(
      (value) =>
        value.startsWith("/images/") ||
        (() => {
          try {
            const url = new URL(value);
            return (
              url.protocol === "https:" &&
              url.hostname.endsWith(".supabase.co")
            );
          } catch {
            return false;
          }
        })(),
      "Use a photo uploaded here (or a /images/ photo).",
    ),
});

export type ProductSaveInput = z.infer<typeof productSaveSchema>;

export const categorySaveSchema = z.object({
  name: z.string().trim().min(2, "Enter a category name.").max(60),
  sortOrder: z.number().int().min(0).max(1000).optional().default(0),
});

export const inventorySaveSchema = z.object({
  productId: z.string().uuid(),
  stockTotal: z
    .number()
    .int()
    .min(0, "Stock cannot be negative.")
    // S-6 (T-61, S6-08): same generous cap as the product schema.
    .max(100000, "Enter stock of 100,000 or less."),
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum([
    "confirmed",
    "processing",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "returned",
    "refunded",
  ]),
  /** On Cancel this is the cancel reason; otherwise an optional note. */
  note: z.string().trim().max(500).nullable().optional(),
});

export const paymentStatusUpdateSchema = z.object({
  status: z.enum(["paid", "failed"]),
});
