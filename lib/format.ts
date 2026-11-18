/**
 * BDT price formatting — integer Taka only, never float/double, never USD.
 * Same grouping style as the prototype: ৳ with en-IN digit grouping
 * (e.g. 3200 -> "৳3,200"), no decimals.
 */
export function formatPriceBdt(priceBdt: number): string {
  if (!Number.isInteger(priceBdt) || priceBdt < 0) {
    throw new Error("Price must be a non-negative integer (BDT).");
  }
  return `৳${new Intl.NumberFormat("en-IN").format(priceBdt)}`;
}

/** Stock state in plain words (blueprint: explicit stock, no jargon). */
export function stockLabel(stockTotal: number): string {
  if (stockTotal <= 0) {
    return "Out of Stock";
  }
  if (stockTotal <= 2) {
    return `Only ${stockTotal} left in stock`;
  }
  return "In Stock";
}
