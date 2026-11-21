"use client";

import CheckoutForm from "@/components/checkout-form";
import { useBag } from "@/lib/bag-context";
import Link from "next/link";

/**
 * Checkout page (S-2, T-22) — guest checkout, no account needed.
 * An empty bag shows an empty state and no form.
 */
export default function CheckoutPage() {
  const { items } = useBag();

  if (items.length === 0) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
          Checkout
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-text-secondary">
          Your bag is empty.
        </p>
        <p className="mt-4 flex flex-wrap gap-4">
          <Link
            href="/sunglasses"
            className="inline-flex min-h-11 items-center rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover"
          >
            Browse sunglasses
          </Link>
          <Link
            href="/bag"
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-6 py-3 font-semibold text-text"
          >
            View your bag
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
      <Link
        href="/bag"
        className="inline-flex min-h-11 items-center font-semibold text-text"
      >
        ← Back to Bag
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        Checkout
      </h1>
      <div className="mt-8 max-w-2xl">
        <CheckoutForm />
      </div>
    </main>
  );
}
