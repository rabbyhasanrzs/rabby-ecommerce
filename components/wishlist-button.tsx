"use client";

import { HeartIcon } from "@/components/icons";
import { useWishlist } from "@/lib/wishlist-context";

/**
 * Wishlist heart toggle (S-7, 1.x-3).
 *
 * Two variants, one behaviour — toggling the slug in the wishlist:
 * - "card": icon-only round button, overlaid on the product card's
 *   image (a SIBLING of the card link, never nested inside it).
 * - "pdp": secondary text button beside Add to Bag on the product
 *   page, with the saved state visible in words.
 *
 * Saved = filled burgundy heart (text-action); unsaved = outline.
 * 44px touch target (min-h-11 / h-11 w-11). aria-pressed + a
 * plain-words aria-label, so the state is clear to screen readers
 * and to keyboard users — activating it never navigates.
 */
export default function WishlistButton({
  slug,
  productName,
  variant,
  className,
}: {
  slug: string;
  productName: string;
  variant: "card" | "pdp";
  className?: string;
}) {
  const { isSaved, toggle } = useWishlist();
  const saved = isSaved(slug);
  const label = saved
    ? `Remove ${productName} from wishlist`
    : `Save ${productName} to wishlist`;

  if (variant === "card") {
    return (
      <button
        type="button"
        onClick={() => toggle(slug)}
        aria-pressed={saved}
        aria-label={label}
        className={`flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface shadow-sm hover:border-action ${
          saved ? "text-action" : "text-text"
        } ${className ?? ""}`}
      >
        <HeartIcon filled={saved} className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggle(slug)}
      aria-pressed={saved}
      aria-label={label}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-3 text-base font-semibold ${
        saved
          ? "border-action bg-action text-text-inverse hover:bg-action-hover"
          : "border-border bg-surface text-text hover:border-action"
      } ${className ?? ""}`}
    >
      <HeartIcon filled={saved} className="h-5 w-5 shrink-0" />
      {saved ? "Saved to wishlist" : "Save to wishlist"}
    </button>
  );
}
