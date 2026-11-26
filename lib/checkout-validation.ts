import type {
  DeliveryZone,
  PaymentMethodId,
} from "@/lib/demo-config";
import { z } from "zod";

/**
 * Guest checkout form validation (S-2, T-22; S-3 adds the per-method
 * payment details — TrxID + sender number for mobile banking).
 * Shared by the checkout form (client) and the checkout API route
 * (server). Both sides use this schema, so a value the form accepts
 * is one the API accepts.
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
  paymentMethod: z.enum(["cod", "bkash", "nagad", "rocket", "card", "online"]),
  /**
   * Mobile-banking payment details (S-3, demo-safe). Only bkash /
   * nagad / rocket use them; the per-method rules live in the
   * superRefine below. paymentSender is normalised here (same
   * normalizePhone as the customer phone) so the value the form and
   * the API send is already 01XXXXXXXXX; the SQL function normalises
   * again — keep both in sync.
   */
  paymentReference: z.string().trim().max(20).optional(),
  paymentSender: z.string().transform((value) => normalizePhone(value)).optional(),
}).superRefine((data, ctx) => {
  const isMobileBanking =
    data.paymentMethod === "bkash" ||
    data.paymentMethod === "nagad" ||
    data.paymentMethod === "rocket";
  const reference = data.paymentReference ?? "";
  const sender = data.paymentSender ?? "";

  if (isMobileBanking) {
    // TrxID: demo-safe approximation of a mobile-banking Transaction
    // ID — 8–12 alphanumeric characters (real TrxIDs are 10, but no
    // provider publishes the format as a strict rule). Mirrors the
    // SQL check in migration 0004 — keep both in sync.
    if (!/^[A-Za-z0-9]{8,12}$/.test(reference)) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentReference"],
        message: "Enter the Transaction ID from your payment.",
      });
    }
    if (!/^01[3-9]\d{8}$/.test(sender)) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentSender"],
        message:
          "Enter a valid Bangladeshi mobile number (01XXXXXXXXX).",
      });
    }
  } else {
    // COD / card / online: no payment details are collected — any
    // value sent (e.g. typed before switching method) is rejected,
    // not ignored, so a stale TrxID can never reach an order. For
    // online, the gateway collects the payment after the order is
    // created — never this form.
    if (reference !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["paymentReference"],
        message: "Transaction ID is only needed for mobile banking.",
      });
    }
    if (sender !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["paymentSender"],
        message: "Sender number is only needed for mobile banking.",
      });
    }
  }
});

export type CheckoutFormData = z.infer<typeof checkoutFormSchema>;
export type { DeliveryZone, PaymentMethodId };
