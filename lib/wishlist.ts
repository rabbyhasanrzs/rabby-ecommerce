import { isValidSlug } from "@/lib/supabase/catalog";

/**
 * Wishlist state — pure reducer, no React, no I/O (S-7, 1.x-3).
 *
 * A wishlist entry is just a product slug — never a price, image, or
 * stock snapshot. Prices and stock are always re-fetched live by
 * slug on the /wishlist page, so a saved item can never show a stale
 * price. Slugs are kept in save order, duplicates impossible.
 *
 * Slug validation reuses the catalogue allowlist (isValidSlug):
 * anything that could never be a product slug is dropped on load,
 * never queried.
 */
export const WISHLIST_STORAGE_KEY = "rabby-wishlist-v1";

export interface WishlistState {
  slugs: string[];
  /** True once the stored list has been read (after mount). */
  loaded: boolean;
}

export const initialWishlistState: WishlistState = {
  slugs: [],
  loaded: false,
};

export type WishlistAction =
  | { type: "load"; slugs: string[] }
  | { type: "add"; slug: string }
  | { type: "remove"; slug: string }
  | { type: "toggle"; slug: string }
  | { type: "clear" };

/**
 * Validate stored data: an array of valid slugs, de-duplicated,
 * in order. Anything else — corrupt JSON, a non-array, non-string
 * entries, invalid slugs — is ignored, never throws.
 */
export function parseStoredWishlist(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !isValidSlug(entry)) {
      continue;
    }
    if (seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    slugs.push(entry);
  }
  return slugs;
}

export function wishlistReducer(
  state: WishlistState,
  action: WishlistAction,
): WishlistState {
  switch (action.type) {
    case "load":
      return { slugs: parseStoredWishlist(action.slugs), loaded: true };
    case "add": {
      if (!isValidSlug(action.slug) || state.slugs.includes(action.slug)) {
        return state;
      }
      return { ...state, slugs: [...state.slugs, action.slug] };
    }
    case "remove":
      return {
        ...state,
        slugs: state.slugs.filter((slug) => slug !== action.slug),
      };
    case "toggle":
      return wishlistReducer(
        state,
        state.slugs.includes(action.slug)
          ? { type: "remove", slug: action.slug }
          : { type: "add", slug: action.slug },
      );
    case "clear":
      return { ...state, slugs: [] };
  }
}

/** Number of saved products. */
export function wishlistCount(state: WishlistState): number {
  return state.slugs.length;
}
