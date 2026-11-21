import type {
  DeliveryZone,
  PaymentMethodId,
} from "@/lib/demo-config";
import { z } from "zod";

/**
 * Guest checkout form validation (S-2, T-22) — shared by the checkout
 * form (client) and the checkout API route (server). Both sides use
 * this schema, so a value the form accepts is one the API accepts.
 *
 * Phone numbers are Bangladeshi mobiles, normalised to 01XXXXXXXXX
 * (11 digits). "+8801…" and "8801…" are accepted and normalised to
 * "01…". The SQL order functions normalise the same way — keep both
 * in sync.
 */

export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+880")) {
    return `0${cleaned.slice(4)}`;
  }
  if (cleaned.startsWith("880")) {
    return `0${cleaned.slice(3)}`;
  }
  return cleaned;
}

export const phoneSchema = z
  .string()
  .transform((value) => normalizePhone(value))
  .pipe(
    z
      .string()
      .regex(
        /^01[3-9]\d{8}$/,
        "Enter a valid Bangladeshi mobile number (01XXXXXXXXX).",
      ),
  );

export const checkoutFormSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  phone: phoneSchema,
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(100),
  address: z
    .string()
    .trim()
    .min(10, "Enter your full delivery address.")
    .max(500),
  zone: z.enum(["inside", "outside"]),
  paymentMethod: z.enum(["cod", "bkash", "nagad", "rocket", "card"]),
});

export type CheckoutFormData = z.infer<typeof checkoutFormSchema>;
export type { DeliveryZone, PaymentMethodId };
