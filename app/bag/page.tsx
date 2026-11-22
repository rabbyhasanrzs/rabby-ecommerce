"use client";

import ProductImage from "@/components/product-image";
import { useBag } from "@/lib/bag-context";
import { DELIVERY_OPTIONS, DEMO_TAX_RATE_PERCENT } from "@/lib/demo-config";
import { formatPriceBdt } from "@/lib/format";
import { computeTotals } from "@/lib/pricing";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Dedicated bag page (S-2, T-20) — the PRIMARY cart surface.
 *
 * Lines come from the bag (localStorage-persisted). On mount — and
 * whenever the bag changes — the page POSTs the snapshot to
 * /api/bag/validate (see the API contract in the S-2 kickoff pack):
 * the server is authoritative on price and stock. If validation
 * fails (network or server error) the local snapshot is shown as-is
 * with no blocking error. Validation issues are shown plainly; an
 * out_of_stock / not_found issue disables Checkout. A price_changed
 * issue updates the displayed line price.
 *
 * Totals are display only, via computeTotals(subtotal, "inside") —
 * DEMO CONFIG tax 5%, delivery Inside Dhaka ৳60. The delivery fee
 * shown here is for Inside Dhaka; the zone is confirmed at checkout.
 */

interface ValidatedItem {
  slug: string;
  name: string;
  priceBdt: number;
  stockTotal: number;
  quantity: number;
  available: boolean;
  lineTotalBdt: number;
}

type IssueType =
  | "price_changed"
  | "out_of_stock"
  | "not_found"
  | "quantity_reduced";

interface ValidateIssue {
  slug: string;
  type: IssueType;
  message: string;
}

interface ValidateResponse {
  ok: boolean;
  items: ValidatedItem[];
  issues: ValidateIssue[];
}

const BLOCKING_TYPES: IssueType[] = ["out_of_stock", "not_found"];

export default function BagPage() {
  const { items, removeItem, setQuantity } = useBag();
  const [validated, setValidated] = useState<Map<string, ValidatedItem>>(
    () => new Map(),
  );
  const [issues, setIssues] = useState<ValidateIssue[]>([]);

  // Validate the snapshot against the server; fall back to the local
  // snapshot (no blocking error) when the request fails.
  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const controller = new AbortController();
    const validate = async () => {
      try {
        const response = await fetch("/api/bag/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map(({ slug, quantity, priceBdt }) => ({
              slug,
              quantity,
              priceBdt,
            })),
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const data: ValidateResponse = await response.json();
        if (controller.signal.aborted) {
          return;
        }
        setValidated(
          new Map(data.items.map((item) => [item.slug, item])),
        );
        setIssues(data.issues ?? []);
      } catch {
        // Network/abort — keep the local snapshot, no blocking error.
      }
    };
    void validate();
    return () => controller.abort();
  }, [items]);

  const empty = items.length === 0;
  // Only issues for lines still in the bag are shown — stale issues
  // from a previous bag state are ignored, not cleared in the effect.
  const visibleIssues = empty
    ? []
    : issues.filter((issue) =>
        items.some((item) => item.slug === issue.slug),
      );
  const hasBlockingIssue = visibleIssues.some((issue) =>
    BLOCKING_TYPES.includes(issue.type),
  );
  const checkoutDisabled = empty || hasBlockingIssue;

  // Displayed lines: validated price where the server gave one,
  // otherwise the local snapshot price.
  const lines = items.map((item) => {
    const check = validated.get(item.slug);
    const priceBdt = check?.priceBdt ?? item.priceBdt;
    return { item, priceBdt, stockTotal: check?.stockTotal };
  });
  const subtotalBdt = lines.reduce(
    (sum, line) => sum + line.priceBdt * line.item.quantity,
    0,
  );
  const totals = computeTotals(subtotalBdt, "inside");

  /** Stepper: clamp to the validated stock; without validation the
   *  snapshot itself is the limit (increase allowed up to the new qty). */
  const changeQuantity = (
    slug: string,
    variantColour: string | null,
    currentQty: number,
    delta: number,
    stockTotal: number | undefined,
  ) => {
    const nextQty = currentQty + delta;
    setQuantity(
      slug,
      variantColour,
      nextQty,
      stockTotal ?? Math.max(nextQty, currentQty),
    );
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        Your bag
      </h1>

      {empty ? (
        <div className="mt-8 rounded-lg border border-border bg-surface p-6 shadow-sm md:p-8">
          <p className="text-base text-text-secondary">Your bag is empty.</p>
          <Link
            href="/sunglasses"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-action px-4 py-3 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active"
          >
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            {visibleIssues.length > 0 ? (
              <ul
                aria-label="Bag updates"
                className="mb-6 flex flex-col gap-2"
              >
                {visibleIssues.map((issue) => (
                  <li
                    key={`${issue.slug}:${issue.type}`}
                    className="rounded-md border border-border bg-background-subtle px-4 py-3 text-base text-text"
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}

            <ul className="divide-y divide-border rounded-lg border border-border bg-surface px-6 shadow-sm">
              {lines.map(({ item, priceBdt, stockTotal }) => (
                <li
                  key={`${item.slug}:${item.variantColour ?? ""}`}
                  className="flex flex-col gap-4 py-6 sm:flex-row"
                >
                  <ProductImage
                    src={item.image}
                    alt={item.name}
                    className="h-28 w-28 shrink-0 rounded-md border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/product/${item.slug}`}
                      className="text-lg font-semibold text-text hover:text-action"
                    >
                      {item.name}
                    </Link>
                    {item.variantColour ? (
                      <p className="mt-0.5 text-base text-text-secondary">
                        Colour: {item.variantColour}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-base text-text-secondary">
                      {formatPriceBdt(priceBdt)} each
                    </p>
                    <div
                      role="group"
                      aria-label={`Quantity of ${item.name}`}
                      className="mt-3 flex items-center gap-1"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          changeQuantity(
                            item.slug,
                            item.variantColour,
                            item.quantity,
                            -1,
                            stockTotal,
                          )
                        }
                        disabled={item.quantity <= 1}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-lg font-semibold text-text transition-colors hover:border-action disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        −
                      </button>
                      <span
                        aria-live="polite"
                        className="flex h-11 min-w-11 items-center justify-center px-2 text-base font-semibold text-text"
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          changeQuantity(
                            item.slug,
                            item.variantColour,
                            item.quantity,
                            1,
                            stockTotal,
                          )
                        }
                        disabled={
                          stockTotal !== undefined &&
                          item.quantity >= stockTotal
                        }
                        aria-label={`Increase quantity of ${item.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-lg font-semibold text-text transition-colors hover:border-action disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        removeItem(item.slug, item.variantColour)
                      }
                      aria-label={`Remove ${item.name} from bag`}
                      className="mt-2 min-h-11 text-base text-error underline transition-colors hover:text-text"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="shrink-0 text-lg font-semibold text-text">
                    {formatPriceBdt(priceBdt * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>

            <Link
              href="/sunglasses"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 py-3 text-base font-semibold text-text transition-colors hover:border-action"
            >
              Continue Shopping
            </Link>
          </div>

          <aside
            aria-label="Order summary"
            className="h-fit rounded-lg border border-border bg-surface p-6 shadow-sm"
          >
            <h2 className="font-display text-2xl font-bold text-text">
              Summary
            </h2>
            <dl className="mt-4 flex flex-col gap-3 text-base text-text">
              <div className="flex items-center justify-between">
                <dt>Subtotal</dt>
                <dd className="font-semibold">
                  {formatPriceBdt(totals.subtotalBdt)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Tax ({DEMO_TAX_RATE_PERCENT}%)</dt>
                <dd className="font-semibold">
                  {formatPriceBdt(totals.taxBdt)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>
                  Delivery ({DELIVERY_OPTIONS.inside.label})
                </dt>
                <dd className="font-semibold">
                  {formatPriceBdt(totals.deliveryFeeBdt)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-lg font-bold">
                <dt>Total</dt>
                <dd>{formatPriceBdt(totals.totalBdt)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-text-secondary">
              Delivery fee shown for Inside Dhaka. Confirm your zone at
              checkout.
            </p>
            {checkoutDisabled ? (
              <span
                aria-disabled="true"
                className="mt-6 flex min-h-11 cursor-not-allowed items-center justify-center rounded-md bg-action-disabled px-4 py-3 text-base font-semibold text-text-inverse opacity-70"
              >
                Checkout
              </span>
            ) : (
              <Link
                href="/checkout"
                className="mt-6 flex min-h-11 items-center justify-center rounded-md bg-action px-4 py-3 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active"
              >
                Checkout
              </Link>
            )}
            {hasBlockingIssue ? (
              <p className="mt-3 text-sm text-error">
                Checkout is unavailable until the items above are resolved.
              </p>
            ) : null}
          </aside>
        </div>
      )}
    </main>
  );
}
