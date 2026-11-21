import {
  DELIVERY_OPTIONS,
  DEMO_TAX_RATE_PERCENT,
  type DeliveryZone,
} from "@/lib/demo-config";

/**
 * Integer BDT pricing — subtotal + tax + delivery fee = total.
 * All amounts are integer Taka; tax is rounded to the nearest Taka.
 * A float price is impossible by construction (integers in, integers out).
 * The server-side order function (migration 0003) computes the same
 * totals from the same DEMO CONFIG values — the server is authoritative;
 * these client-side totals are display only.
 */

export interface OrderTotals {
  subtotalBdt: number;
  taxBdt: number;
  deliveryFeeBdt: number;
  totalBdt: number;
}

export function computeTotals(
  subtotalBdt: number,
  zone: DeliveryZone,
): OrderTotals {
  if (!Number.isInteger(subtotalBdt) || subtotalBdt < 0) {
    throw new Error("Subtotal must be a non-negative integer (BDT).");
  }
  const taxBdt = Math.round(
    (subtotalBdt * DEMO_TAX_RATE_PERCENT) / 100,
  );
  const deliveryFeeBdt = DELIVERY_OPTIONS[zone].feeBdt;
  return {
    subtotalBdt,
    taxBdt,
    deliveryFeeBdt,
    totalBdt: subtotalBdt + taxBdt + deliveryFeeBdt,
  };
}

/** Sum of price x quantity over bag/order lines (integer Taka). */
export function bagSubtotal(
  items: { priceBdt: number; quantity: number }[],
): number {
  let sum = 0;
  for (const item of items) {
    if (!Number.isInteger(item.priceBdt) || !Number.isInteger(item.quantity)) {
      throw new Error("Bag line price and quantity must be integers.");
    }
    sum += item.priceBdt * item.quantity;
  }
  return sum;
}
