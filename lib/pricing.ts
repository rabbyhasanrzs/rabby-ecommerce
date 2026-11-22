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
 *
 * S-4: computeTotals() takes an optional third `settings` argument.
 * When provided (from the site_settings row via GET /api/settings),
 * its tax % + delivery fees are used instead of the demo-config
 * constants. Call sites that do not pass settings keep the
 * demo-config defaults — the storefront is wired to settings page
 * by page (checkout first, in S-4 Slice A); other call sites keep
 * demo-config defaults until that later pass.
 */

export interface OrderTotals {
  subtotalBdt: number;
  taxBdt: number;
  deliveryFeeBdt: number;
  totalBdt: number;
}

/**
 * Pricing settings, as read from the site_settings row. This is a
 * structural type on purpose: lib/site-settings.ts is server-only,
 * so this module (imported by client components) must not import it
 * — a SiteSettings object satisfies this shape structurally.
 */
export interface PricingSettings {
  taxRatePercent: number;
  deliveryFees: Record<DeliveryZone, number>;
}

export function computeTotals(
  subtotalBdt: number,
  zone: DeliveryZone,
  settings?: PricingSettings,
): OrderTotals {
  if (!Number.isInteger(subtotalBdt) || subtotalBdt < 0) {
    throw new Error("Subtotal must be a non-negative integer (BDT).");
  }
  const taxRatePercent = settings?.taxRatePercent ?? DEMO_TAX_RATE_PERCENT;
  const taxBdt = Math.round((subtotalBdt * taxRatePercent) / 100);
  const deliveryFeeBdt =
    settings?.deliveryFees[zone] ?? DELIVERY_OPTIONS[zone].feeBdt;
  return {
    subtotalBdt,
    taxBdt,
    deliveryFeeBdt,
    totalBdt: subtotalBdt + taxBdt + deliveryFeeBdt,
  };
}

/**
 * Map a site_settings-shaped object to the computeTotals settings
 * argument. The parameter type is structural (see PricingSettings)
 * so callers can pass a SiteSettings without importing the
 * server-only site-settings module.
 */
export function settingsToPricing(settings: {
  taxRatePercent: number;
  deliveryInsideFeeBdt: number;
  deliveryOutsideFeeBdt: number;
}): PricingSettings {
  return {
    taxRatePercent: settings.taxRatePercent,
    deliveryFees: {
      inside: settings.deliveryInsideFeeBdt,
      outside: settings.deliveryOutsideFeeBdt,
    },
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
