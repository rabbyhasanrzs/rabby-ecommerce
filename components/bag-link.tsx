"use client";

import { useBag } from "@/lib/bag-context";
import { BagIcon } from "@/components/icons";
import Link from "next/link";

/**
 * Header Bag link with a LIVE count badge (S-2, T-20).
 *
 * Same burgundy badge styling as the previous static header link.
 * No mount guard is needed here: BagProvider starts with an empty
 * bag and only loads the stored bag after mount, so the server
 * render and the first client render both show 0 and the layout
 * does not shift on hydration.
 */
export default function BagLink() {
  const { itemCount } = useBag();

  return (
    <Link
      href="/bag"
      className="flex shrink-0 items-center gap-1.5 text-base text-text hover:text-action"
      aria-label={`Bag, ${itemCount} items`}
    >
      <BagIcon className="h-5 w-5 shrink-0" />
      Bag
      <span
        aria-hidden="true"
        className="flex h-6 min-w-6 items-center justify-center rounded-full bg-action px-1.5 text-sm font-semibold text-text-inverse"
      >
        {itemCount}
      </span>
    </Link>
  );
}
