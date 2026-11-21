/**
 * Bag state — pure reducer, no React, no I/O (S-2, T-20).
 *
 * A bag line is one product + one colour variant: identity is
 * slug + variantColour, so the same product in two colours is two
 * lines. Prices are integer BDT (never float, never USD).
 *
 * Stock clamping: a line's quantity is always 1..stockTotal.
 * Nothing is ever added when stockTotal <= 0.
 */

export interface BagItem {
  slug: string;
  name: string;
  priceBdt: number;
  image: string | null;
  variantColour: string | null;
  quantity: number;
}

export type BagAction =
  | {
      type: "add";
      item: Omit<BagItem, "quantity">;
      stockTotal: number;
    }
  | { type: "remove"; slug: string; variantColour: string | null }
  | {
      type: "setQuantity";
      slug: string;
      variantColour: string | null;
      quantity: number;
      stockTotal: number;
    }
  | { type: "clear" };

function sameLine(
  item: BagItem,
  slug: string,
  variantColour: string | null,
): boolean {
  return item.slug === slug && item.variantColour === variantColour;
}

/** Clamp a quantity into 1..stockTotal; 0 when there is no stock. */
function clampQuantity(quantity: number, stockTotal: number): number {
  if (stockTotal <= 0) {
    return 0;
  }
  return Math.min(Math.max(quantity, 1), stockTotal);
}

export function bagReducer(items: BagItem[], action: BagAction): BagItem[] {
  switch (action.type) {
    case "add": {
      if (action.stockTotal <= 0) {
        return items;
      }
      const existing = items.find((item) =>
        sameLine(item, action.item.slug, action.item.variantColour),
      );
      if (existing) {
        const quantity = clampQuantity(
          existing.quantity + 1,
          action.stockTotal,
        );
        return items.map((item) =>
          sameLine(item, action.item.slug, action.item.variantColour)
            ? { ...item, quantity }
            : item,
        );
      }
      return [...items, { ...action.item, quantity: 1 }];
    }
    case "remove":
      return items.filter(
        (item) => !sameLine(item, action.slug, action.variantColour),
      );
    case "setQuantity": {
      const quantity = clampQuantity(action.quantity, action.stockTotal);
      if (quantity === 0) {
        // No stock left for this line — drop it rather than hold qty 0.
        return items.filter(
          (item) => !sameLine(item, action.slug, action.variantColour),
        );
      }
      return items.map((item) =>
        sameLine(item, action.slug, action.variantColour)
          ? { ...item, quantity }
          : item,
      );
    }
    case "clear":
      return [];
  }
}

/** Total units in the bag (sum of line quantities). */
export function bagItemCount(items: BagItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}
