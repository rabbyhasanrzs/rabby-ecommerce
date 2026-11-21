import {
  bagItemCount,
  bagReducer,
  type BagItem,
} from "@/lib/bag";
import { describe, expect, it } from "vitest";

const ROUND_A: Omit<BagItem, "quantity"> = {
  slug: "sample-round-a",
  name: "SAMPLE Round A",
  priceBdt: 950,
  image: "/images/sample-round-a.webp",
  variantColour: "Black",
};

const ROUND_A_GOLD: Omit<BagItem, "quantity"> = {
  ...ROUND_A,
  variantColour: "Gold",
};

describe("bagReducer", () => {
  it("adds a new line at qty 1", () => {
    const next = bagReducer([], {
      type: "add",
      item: ROUND_A,
      stockTotal: 5,
    });
    expect(next).toEqual([{ ...ROUND_A, quantity: 1 }]);
  });

  it("adding an existing line increases qty, clamped to stock", () => {
    const start: BagItem[] = [{ ...ROUND_A, quantity: 4 }];
    const next = bagReducer(start, {
      type: "add",
      item: ROUND_A,
      stockTotal: 5,
    });
    expect(next[0].quantity).toBe(5);
    // Already at stock — adding again does not exceed it.
    const capped = bagReducer(next, {
      type: "add",
      item: ROUND_A,
      stockTotal: 5,
    });
    expect(capped[0].quantity).toBe(5);
  });

  it("treats the same product in another colour as a separate line", () => {
    const start: BagItem[] = [{ ...ROUND_A, quantity: 1 }];
    const next = bagReducer(start, {
      type: "add",
      item: ROUND_A_GOLD,
      stockTotal: 5,
    });
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ ...ROUND_A_GOLD, quantity: 1 });
  });

  it("ignores an add when stock is 0", () => {
    const next = bagReducer([], {
      type: "add",
      item: ROUND_A,
      stockTotal: 0,
    });
    expect(next).toEqual([]);
  });

  it("setQuantity clamps to stock and to a minimum of 1", () => {
    const start: BagItem[] = [{ ...ROUND_A, quantity: 1 }];
    const over = bagReducer(start, {
      type: "setQuantity",
      slug: ROUND_A.slug,
      variantColour: "Black",
      quantity: 99,
      stockTotal: 3,
    });
    expect(over[0].quantity).toBe(3);
    const under = bagReducer(start, {
      type: "setQuantity",
      slug: ROUND_A.slug,
      variantColour: "Black",
      quantity: 0,
      stockTotal: 3,
    });
    expect(under[0].quantity).toBe(1);
  });

  it("removes only the matching line", () => {
    const start: BagItem[] = [
      { ...ROUND_A, quantity: 1 },
      { ...ROUND_A_GOLD, quantity: 2 },
    ];
    const next = bagReducer(start, {
      type: "remove",
      slug: ROUND_A.slug,
      variantColour: "Black",
    });
    expect(next).toEqual([{ ...ROUND_A_GOLD, quantity: 2 }]);
  });

  it("clear empties the bag", () => {
    const start: BagItem[] = [{ ...ROUND_A, quantity: 2 }];
    expect(bagReducer(start, { type: "clear" })).toEqual([]);
  });
});

describe("bagItemCount", () => {
  it("sums quantities across lines", () => {
    expect(
      bagItemCount([
        { ...ROUND_A, quantity: 2 },
        { ...ROUND_A_GOLD, quantity: 3 },
      ]),
    ).toBe(5);
    expect(bagItemCount([])).toBe(0);
  });
});
