"use client";

import { HeartIcon } from "@/components/icons";
import { useWishlist } from "@/lib/wishlist-context";
import Link from "next/link";

/**
 * Header Wishlist link with a LIVE count badge (S-7, 1.x-3).
 *
 * Mirrors components/bag-link.tsx: a heart icon + "Wishlist" +
 * the saved count in the burgundy accent (bg-action),
 * aria-label="Wishlist, N saved". No mount guard is needed here:
 * WishlistProvider starts with an empty list and only loads the
 * stored list after mount, so the server render and the first
 * client render both show 0 and the layout does not shift on
 * hydration.
 */
export default function WishlistLink() {
  const { count } = useWishlist();

  return (
    <Link
      href="/wishlist"
      className="flex shrink-0 items-center gap-1.5 text-base text-text hover:text-action"
      aria-label={`Wishlist, ${count} saved`}
    >
      <HeartIcon filled={false} className="h-5 w-5 shrink-0" />
      Wishlist
      <span
        aria-hidden="true"
        className="flex h-6 min-w-6 items-center justify-center rounded-full bg-action px-1.5 text-sm font-semibold text-text-inverse"
      >
        {count}
      </span>
    </Link>
  );
}
