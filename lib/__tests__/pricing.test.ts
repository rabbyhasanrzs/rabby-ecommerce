import { bagSubtotal, computeTotals } from "@/lib/pricing";
import { describe, expect, it } from "vitest";

describe("computeTotals", () => {
  it("computes tax 5% (rounded), delivery ৳60 inside, total for 950", () => {
    // 950 x 5% = 47.5 -> rounds to 48.
    expect(computeTotals(950, "inside")).toEqual({
      subtotalBdt: 950,
      taxBdt: 48,
      deliveryFeeBdt: 60,
      totalBdt: 1058,
    });
  });

  it("computes tax 50 for a 1000 subtotal", () => {
    expect(computeTotals(1000, "inside")).toEqual({
      subtotalBdt: 1000,
      taxBdt: 50,
      deliveryFeeBdt: 60,
      totalBdt: 1110,
    });
  });

  it("charges ৳120 delivery outside Dhaka", () => {
    expect(computeTotals(1000, "outside")).toEqual({
      subtotalBdt: 1000,
      taxBdt: 50,
      deliveryFeeBdt: 120,
      totalBdt: 1170,
    });
  });

  it("total always equals subtotal + tax + delivery", () => {
    for (const subtotal of [0, 1, 99, 333, 950, 1234, 10000]) {
      for (const zone of ["inside", "outside"] as const) {
        const totals = computeTotals(subtotal, zone);
        expect(totals.totalBdt).toBe(
          totals.subtotalBdt + totals.taxBdt + totals.deliveryFeeBdt,
        );
      }
    }
  });

  it("returns all-integer amounts", () => {
    const totals = computeTotals(333, "inside");
    for (const value of Object.values(totals)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("throws on a float subtotal", () => {
    expect(() => computeTotals(950.5, "inside")).toThrow();
  });

  it("throws on a negative subtotal", () => {
    expect(() => computeTotals(-1, "inside")).toThrow();
  });
});

describe("bagSubtotal", () => {
  it("sums price x quantity over lines", () => {
    expect(
      bagSubtotal([
        { priceBdt: 950, quantity: 2 },
        { priceBdt: 300, quantity: 1 },
      ]),
    ).toBe(2200);
  });

  it("is 0 for an empty bag", () => {
    expect(bagSubtotal([])).toBe(0);
  });
});
