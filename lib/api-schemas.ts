import {
  checkoutFormSchema,
  phoneSchema,
} from "@/lib/checkout-validation";
import { slugSchema } from "@/lib/supabase/catalog";
import { ORDER_REFERENCE_PATTERN } from "@/lib/supabase/orders";
import { z } from "zod";

/**
 * Zod request schemas for the S-2 API routes — the contract the
 * bag / checkout / confirmation / track-order pages code against.
 * Every route safeParses its body against one of these and returns
 * 400 on failure, so invalid input never reaches Supabase.
 */

/** One bag line the client wants re-validated against live DB data. */
const bagItemSchema = z.object({
  slug: slugSchema,
  quantity: z.number().int().min(1).max(99),
  /** Client's last-known price; omitted when the client never saw one. */
  priceBdt: z.number().int().min(0).optional(),
});

export const bagValidateRequestSchema = z.object({
  items: z.array(bagItemSchema).min(1).max(20),
});

export type BagValidateRequest = z.infer<typeof bagValidateRequestSchema>;

/** One checkout line: the server re-prices it from the DB (never trusts the client price). */
const checkoutItemSchema = z.object({
  slug: slugSchema,
  variantColour: z.string().nullable(),
  quantity: z.number().int().min(1).max(99),
});

export const checkoutRequestSchema = z.object({
  customer: checkoutFormSchema,
  items: z.array(checkoutItemSchema).min(1).max(20),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/** Order lookup: reference + phone. The phone is normalised by phoneSchema
 *  (e.g. "+8801…" -> "01…") before it reaches the lookup function. */
export const lookupRequestSchema = z.object({
  reference: z
    .string()
    .trim()
    .regex(
      ORDER_REFERENCE_PATTERN,
      "Enter a valid order reference (RB-2026-123456).",
    ),
  phone: phoneSchema,
});

export type LookupRequest = z.infer<typeof lookupRequestSchema>;

/** Cancel uses exactly the same shape as lookup. */
export const cancelRequestSchema = lookupRequestSchema;

export type CancelRequest = z.infer<typeof cancelRequestSchema>;
