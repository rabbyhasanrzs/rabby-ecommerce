"use client";

import { useBag } from "@/lib/bag-context";
import { formatPriceBdt } from "@/lib/format";
import { CloseIcon } from "@/components/icons";
import ProductImage from "@/components/product-image";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Mini-cart drawer (S-2, T-20) — opens when an item is added to the bag.
 *
 * Fixed right-side drawer, role="dialog". Escape, the backdrop, the
 * close button, and "Continue Shopping" all close it; the page behind
 * it does not scroll while open (same pattern as the photo lightbox
 * in components/product-image.tsx). Renders nothing when closed.
 */
export default function MiniCartDrawer() {
  const { items, subtotalBdt, removeItem, isDrawerOpen, closeDrawer } =
    useBag();

  // Escape closes; the page behind the drawer does not scroll.
  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen, closeDrawer]);

  if (!isDrawerOpen) {
    return null;
  }

  const empty = items.length === 0;

  return (
    <div
      data-testid="mini-cart-drawer"
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="Your bag"
    >
      {/* Backdrop — click closes. */}
      <button
        type="button"
        aria-label="Close your bag"
        onClick={closeDrawer}
        className="absolute inset-0 h-full w-full cursor-default bg-text/50"
      />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-surface shadow-md">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-2xl font-bold text-text">
            Your bag
          </h2>
          <button
            type="button"
            onClick={closeDrawer}
            autoFocus
            aria-label="Close your bag"
            className="flex h-11 w-11 items-center justify-center rounded-full text-text hover:bg-surface-hover"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
            <p className="text-base text-text-secondary">
              Your bag is empty.
            </p>
            <button
              type="button"
              onClick={closeDrawer}
              className="flex min-h-11 items-center justify-center rounded-md border border-border px-4 py-2 text-base font-semibold text-text hover:border-action"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-4">
              {items.map((item) => (
                <li
                  key={`${item.slug}:${item.variantColour ?? ""}`}
                  className="flex gap-3 py-4"
                >
                  <ProductImage
                    src={item.image}
                    alt={item.name}
                    className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-text">
                      {item.name}
                    </p>
                    {item.variantColour ? (
                      <p className="mt-0.5 text-sm text-text-secondary">
                        Colour: {item.variantColour}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {formatPriceBdt(item.priceBdt)} each
                    </p>
                    <p className="mt-0.5 text-sm text-text">
                      Qty {item.quantity}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        removeItem(item.slug, item.variantColour)
                      }
                      aria-label={`Remove ${item.name} from bag`}
                      className="mt-1 min-h-11 text-base text-error underline hover:text-text"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="shrink-0 text-base font-semibold text-text">
                    {formatPriceBdt(item.priceBdt * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="border-t border-border px-4 py-4">
              <p className="flex items-center justify-between text-base font-semibold text-text">
                <span>Subtotal</span>
                <span>{formatPriceBdt(subtotalBdt)}</span>
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Tax and delivery are calculated at checkout.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <Link
                  href="/checkout"
                  onClick={closeDrawer}
                  className="flex min-h-11 items-center justify-center rounded-md bg-action px-4 py-3 text-base font-semibold text-text-inverse hover:bg-action-hover"
                >
                  Checkout
                </Link>
                <Link
                  href="/bag"
                  onClick={closeDrawer}
                  className="flex min-h-11 items-center justify-center rounded-md border border-border px-4 py-3 text-base font-semibold text-text hover:border-action"
                >
                  View Bag
                </Link>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="flex min-h-11 items-center justify-center rounded-md px-4 py-3 text-base font-semibold text-text hover:bg-surface-hover"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
