"use client";

import { bagItemCount, bagReducer, type BagItem } from "@/lib/bag";
import { bagSubtotal } from "@/lib/pricing";
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Bag state (S-2, T-20) — reducer + localStorage + mini-cart drawer state.
 *
 * Persistence key "rabby-bag-v1". localStorage is read ONLY after mount
 * (inside useEffect) so the server render and the first client render
 * both start empty — no hydration mismatch. Writes are also gated on
 * the bag having loaded, so the initial empty state never overwrites
 * a stored bag.
 */

const STORAGE_KEY = "rabby-bag-v1";

interface BagContextValue {
  items: BagItem[];
  itemCount: number;
  subtotalBdt: number;
  addItem: (item: Omit<BagItem, "quantity">, stockTotal: number) => void;
  removeItem: (slug: string, variantColour: string | null) => void;
  setQuantity: (
    slug: string,
    variantColour: string | null,
    quantity: number,
    stockTotal: number,
  ) => void;
  clearBag: () => void;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const BagContext = createContext<BagContextValue | null>(null);

function loadStoredBag(): BagItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is BagItem =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as BagItem).slug === "string" &&
        typeof (entry as BagItem).name === "string" &&
        Number.isInteger((entry as BagItem).priceBdt) &&
        Number.isInteger((entry as BagItem).quantity) &&
        (entry as BagItem).quantity >= 1,
    );
  } catch {
    return [];
  }
}

export function BagProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(bagReducer, []);
  // Set once the stored bag has been read (after mount). A ref, not
  // state: nothing needs to re-render when it flips, it only gates
  // the persist effect below.
  const loadedRef = useRef(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Read localStorage only after mount.
  useEffect(() => {
    dispatch({ type: "clear" });
    const stored = loadStoredBag();
    for (const item of stored) {
      // "add" always starts at qty 1, so restore the stored quantity
      // right after (clamped to the stored qty itself, so it lands exact).
      dispatch({
        type: "add",
        item: {
          slug: item.slug,
          name: item.name,
          priceBdt: item.priceBdt,
          image: item.image ?? null,
          variantColour: item.variantColour ?? null,
        },
        stockTotal: item.quantity,
      });
      dispatch({
        type: "setQuantity",
        slug: item.slug,
        variantColour: item.variantColour ?? null,
        quantity: item.quantity,
        stockTotal: item.quantity,
      });
    }
    loadedRef.current = true;
  }, []);

  // Persist after the stored bag has loaded — never overwrite it with [].
  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full or unavailable — the bag still works in memory.
    }
  }, [items]);

  const value: BagContextValue = {
    items,
    itemCount: bagItemCount(items),
    subtotalBdt: bagSubtotal(items),
    addItem: (item, stockTotal) => {
      dispatch({ type: "add", item, stockTotal });
      setIsDrawerOpen(true);
    },
    removeItem: (slug, variantColour) =>
      dispatch({ type: "remove", slug, variantColour }),
    setQuantity: (slug, variantColour, quantity, stockTotal) =>
      dispatch({ type: "setQuantity", slug, variantColour, quantity, stockTotal }),
    clearBag: () => dispatch({ type: "clear" }),
    isDrawerOpen,
    openDrawer: () => setIsDrawerOpen(true),
    closeDrawer: () => setIsDrawerOpen(false),
  };

  return <BagContext.Provider value={value}>{children}</BagContext.Provider>;
}

export function useBag(): BagContextValue {
  const bag = useContext(BagContext);
  if (!bag) {
    throw new Error("useBag must be used inside <BagProvider>.");
  }
  return bag;
}
