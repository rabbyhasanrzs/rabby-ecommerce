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
    .min(1, "Enter a price greater than ৳0."),
  stockTotal: z
    .number()
    .int("Stock must be a whole number.")
    .min(0, "Stock cannot be negative."),
  status: z.enum(["active", "inactive"]),
  description: z.string().trim().max(2000).optional().default(""),
  colour: z.string().trim().min(1, "Enter a colour.").max(50),
  /** Public URL of the uploaded photo (or the existing photo on edit). */
  imageUrl: z.string().trim().min(1, "Upload a product photo."),
});

export type ProductSaveInput = z.infer<typeof productSaveSchema>;

export const categorySaveSchema = z.object({
  name: z.string().trim().min(2, "Enter a category name.").max(60),
  sortOrder: z.number().int().min(0).max(1000).optional().default(0),
});

export const inventorySaveSchema = z.object({
  productId: z.string().uuid(),
  stockTotal: z.number().int().min(0, "Stock cannot be negative."),
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
