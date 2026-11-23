"use client";

import {
  initialWishlistState,
  parseStoredWishlist,
  wishlistReducer,
  WISHLIST_STORAGE_KEY,
} from "@/lib/wishlist";
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

/**
 * Wishlist state (S-7, 1.x-3) — reducer + localStorage.
 *
 * Storage key "rabby-wishlist-v1", the exact mirror of the bag's
 * "rabby-bag-v1" (lib/bag-context.tsx): localStorage is read ONLY
 * after mount (inside useEffect) so the server render and the first
 * client render both start empty — no hydration mismatch. Writes
 * are gated on the stored list having loaded, so the initial empty
 * state never overwrites a stored wishlist. Corrupt or wrong-shape
 * stored data is ignored, never crashes the page.
 *
 * Guest-first, like the bag: no account, no server storage, no
 * migration — the wishlist lives on this device and browser only
 * (the /wishlist page says so in plain words).
 */

interface WishlistContextValue {
  slugs: string[];
  count: number;
  /** True once the stored list has been read (after mount). */
  loaded: boolean;
  isSaved: (slug: string) => boolean;
  toggle: (slug: string) => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

function loadStoredWishlist(): string[] {
  try {
    const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return parseStoredWishlist(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    wishlistReducer,
    initialWishlistState,
  );
  // Set once the stored wishlist has been read (after mount). A ref,
  // not state: nothing needs to re-render when it flips, it only
  // gates the persist effect below.
  const loadedRef = useRef(false);

  // Read localStorage only after mount.
  useEffect(() => {
    dispatch({ type: "load", slugs: loadStoredWishlist() });
    loadedRef.current = true;
  }, []);

  // Persist after the stored wishlist has loaded — never overwrite
  // it with [].
  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }
    try {
      window.localStorage.setItem(
        WISHLIST_STORAGE_KEY,
        JSON.stringify(state.slugs),
      );
    } catch {
      // Storage full or unavailable — the wishlist still works in memory.
    }
  }, [state.slugs]);

  const value: WishlistContextValue = {
    slugs: state.slugs,
    count: state.slugs.length,
    loaded: state.loaded,
    isSaved: (slug) => state.slugs.includes(slug),
    toggle: (slug) => dispatch({ type: "toggle", slug }),
  };

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const wishlist = useContext(WishlistContext);
  if (!wishlist) {
    throw new Error("useWishlist must be used inside <WishlistProvider>.");
  }
  return wishlist;
}
