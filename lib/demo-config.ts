/**
 * DEMO CONFIG — S-2 proposed values, NOT approved, NEVER final.
 *
 * Tax + delivery fees are still TBD per the Final Approved Design
 * Blueprint. These values come from the prototype's demo config
 * (tax 5%, delivery Inside Dhaka ৳60 / Outside Dhaka ৳120) and are
 * placeholders the owner confirms (or replaces) before launch. The
 * same numbers are mirrored in supabase/migrations/0003_s2_orders.sql
 * (the server-side order function computes totals from them) — change
 * both together. S-4 Admin will own these values (FR-16–FR-19).
 *
 * BDT integer only, never float/double, never USD.
 */

export const DEMO_TAX_RATE_PERCENT = 5;

export type DeliveryZone = "inside" | "outside";

export interface DeliveryOption {
  feeBdt: number;
  label: string;
  /** Plain-words delivery estimate shown at checkout and confirmation. */
  estimate: string;
}

export const DELIVERY_OPTIONS: Record<DeliveryZone, DeliveryOption> = {
  inside: { feeBdt: 60, label: "Inside Dhaka", estimate: "1–2 days" },
  outside: { feeBdt: 120, label: "Outside Dhaka", estimate: "3–5 days" },
};

export type PaymentMethodId = "cod" | "bkash" | "nagad" | "rocket" | "card";

export interface PaymentMethod {
  id: PaymentMethodId;
  /** Checkout grouping, prototype order: COD first, Mobile Banking, Card. */
  group: string;
  label: string;
  note: string;
}

/**
 * Payment is a SELECTION ONLY in S-2 — no money moves, no gateway.
 * S-3 (demo-safe, D-1): COD works fully; mobile banking is a manual
 * flow — the customer pays first, then enters the Transaction ID +
 * sender number; card details are NEVER collected, card payment is
 * confirmed after the order. No gateway, no real money moves in S-3.
 */
export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "cod",
    group: "Cash on Delivery",
    label: "Cash on Delivery",
    note: "Pay in cash when your order arrives.",
  },
  {
    id: "bkash",
    group: "Mobile Banking",
    label: "bKash",
    note: "Send money first, then enter your Transaction ID and sender number.",
  },
  {
    id: "nagad",
    group: "Mobile Banking",
    label: "Nagad",
    note: "Send money first, then enter your Transaction ID and sender number.",
  },
  {
    id: "rocket",
    group: "Mobile Banking",
    label: "Rocket",
    note: "Send money first, then enter your Transaction ID and sender number.",
  },
  {
    id: "card",
    group: "Card",
    label: "Debit / Credit Card",
    note: "Card payment is confirmed after you place the order — no money moves in S-3.",
  },
];
