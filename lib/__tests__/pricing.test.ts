import {
  bagSubtotal,
  computeDiscountedTotals,
  computeTotals,
} from "@/lib/pricing";
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

describe("computeDiscountedTotals", () => {
  it("applies 10% off, then taxes the discounted subtotal (1000, inside)", () => {
    // Discount 100, discounted subtotal 900, tax 5% of 900 = 45,
    // delivery 60, total 1005. Mirrors migration 0009 §4.
    expect(computeDiscountedTotals(1000, "inside", 10)).toEqual({
      subtotalBdt: 1000,
      discountBdt: 100,
      taxBdt: 45,
      deliveryFeeBdt: 60,
      totalBdt: 1005,
    });
  });

  it("rounds the discount and the tax (333 at 10%, inside)", () => {
    // Discount 33.3 -> 33, discounted subtotal 300, tax 15,
    // delivery 60, total 375.
    expect(computeDiscountedTotals(333, "inside", 10)).toEqual({
      subtotalBdt: 333,
      discountBdt: 33,
      taxBdt: 15,
      deliveryFeeBdt: 60,
      totalBdt: 375,
    });
  });

  it("rounds tax up when the discounted subtotal gives .5 or more (950 at 10%)", () => {
    // Discount 95, discounted subtotal 855, tax 42.75 -> 43.
    expect(computeDiscountedTotals(950, "inside", 10)).toEqual({
      subtotalBdt: 950,
      discountBdt: 95,
      taxBdt: 43,
      deliveryFeeBdt: 60,
      totalBdt: 958,
    });
  });

  it("charges ৳120 delivery outside Dhaka", () => {
    expect(computeDiscountedTotals(1000, "outside", 10)).toEqual({
      subtotalBdt: 1000,
      discountBdt: 100,
      taxBdt: 45,
      deliveryFeeBdt: 120,
      totalBdt: 1065,
    });
  });

  it("100% off leaves only the delivery fee", () => {
    expect(computeDiscountedTotals(1000, "inside", 100)).toEqual({
      subtotalBdt: 1000,
      discountBdt: 1000,
      taxBdt: 0,
      deliveryFeeBdt: 60,
      totalBdt: 60,
    });
  });

  it("zero percent off equals the old totals plus discountBdt 0", () => {
    for (const subtotal of [0, 1, 99, 333, 950, 1234, 10000]) {
      for (const zone of ["inside", "outside"] as const) {
        expect(computeDiscountedTotals(subtotal, zone, 0)).toEqual({
          ...computeTotals(subtotal, zone),
          discountBdt: 0,
        });
      }
    }
  });

  it("total always equals (subtotal - discount) + tax + delivery", () => {
    for (const subtotal of [0, 1, 99, 333, 950, 1234, 10000]) {
      for (const zone of ["inside", "outside"] as const) {
        for (const percentOff of [1, 10, 25, 50, 100]) {
          const totals = computeDiscountedTotals(subtotal, zone, percentOff);
          expect(totals.totalBdt).toBe(
            totals.subtotalBdt -
              totals.discountBdt +
              totals.taxBdt +
              totals.deliveryFeeBdt,
          );
        }
      }
    }
  });

  it("returns all-integer amounts", () => {
    const totals = computeDiscountedTotals(333, "inside", 15);
    for (const value of Object.values(totals)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("uses settings tax + delivery when provided", () => {
    // Discount 100, discounted subtotal 900, tax 10% of 900 = 90,
    // delivery 50 (settings), total 1040.
    expect(
      computeDiscountedTotals(1000, "inside", 10, {
        taxRatePercent: 10,
        deliveryFees: { inside: 50, outside: 100 },
      }),
    ).toEqual({
      subtotalBdt: 1000,
      discountBdt: 100,
      taxBdt: 90,
      deliveryFeeBdt: 50,
      totalBdt: 1040,
    });
  });

  it("throws on a float or negative subtotal", () => {
    expect(() => computeDiscountedTotals(950.5, "inside", 10)).toThrow();
    expect(() => computeDiscountedTotals(-1, "inside", 10)).toThrow();
  });

  it("throws on percent off outside 0–100", () => {
    expect(() => computeDiscountedTotals(1000, "inside", -1)).toThrow();
    expect(() => computeDiscountedTotals(1000, "inside", 101)).toThrow();
    expect(() => computeDiscountedTotals(1000, "inside", 10.5)).toThrow();
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
