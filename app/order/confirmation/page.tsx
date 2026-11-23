"use client";

import {
  DELIVERY_OPTIONS,
  PAYMENT_METHODS,
} from "@/lib/demo-config";
import { formatPriceBdt } from "@/lib/format";
import {
  isMobileBankingMethod,
  paymentStatusLabel,
  type OrderDetail,
} from "@/lib/supabase/orders";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

/**
 * Order confirmation page (S-2, T-23).
 *
 * Reads ?ref=, looks the order up with the phone saved at checkout
 * (sessionStorage "rabby-order-phone"); if no phone was saved, asks for
 * it first. Shows the reference large with a Copy button, the items,
 * totals, delivery estimate, payment method, and a Track Your Order link.
 */

const NOT_FOUND_MESSAGE =
  "Order not found. Check the reference and phone number and try again.";

function paymentLabel(paymentMethod: string): string {
  return (
    PAYMENT_METHODS.find((method) => method.id === paymentMethod)?.label ??
    paymentMethod
  );
}

async function lookupOrder(
  reference: string,
  phone: string,
): Promise<OrderDetail | null> {
  const response = await fetch("/api/orders/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference, phone }),
  });
  if (!response.ok) {
    return null;
  }
  const data: { ok?: boolean; order?: OrderDetail } =
    await response.json();
  return data.ok && data.order ? data.order : null;
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("ref") ?? "";

  const [phone, setPhone] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const referenceRef = useRef<HTMLSpanElement>(null);

  const loadOrder = useCallback(
    async (lookupPhone: string) => {
      setLoading(true);
      setError(null);
      try {
        const found = await lookupOrder(reference, lookupPhone);
        if (found) {
          setOrder(found);
        } else {
          setError(NOT_FOUND_MESSAGE);
        }
      } catch {
        setError(NOT_FOUND_MESSAGE);
      } finally {
        setLoading(false);
      }
    },
    [reference],
  );

  // The phone saved at checkout lets the confirmation load on its own.
  // sessionStorage is browser-only, so it is read here, once, after
  // mount — same pattern as components/copyright-year.tsx.
  useEffect(() => {
    if (!reference) {
      return;
    }
    const savedPhone = sessionStorage.getItem("rabby-order-phone");
    if (savedPhone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhone(savedPhone);
      void loadOrder(savedPhone);
    } else {
      setPhone("");
    }
  }, [reference, loadOrder]);

  async function handlePhoneSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phoneInput.trim()) {
      setPhoneError("Enter the phone number used for this order.");
      return;
    }
    setPhoneError(null);
    setPhone(phoneInput.trim());
    await loadOrder(phoneInput.trim());
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
    } catch {
      // Fallback: select the reference text so the customer can copy it.
      const element = referenceRef.current;
      if (element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setCopied(true);
    }
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (!reference) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
          Order confirmation
        </h1>
        <p role="alert" className="mt-4 text-lg text-error">
          No order reference was given. Check the link and try again.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        Thank you — your order is placed.
      </h1>

      {loading ? (
        <p className="mt-6 text-lg text-text-secondary">
          Loading your order…
        </p>
      ) : null}

      {error && !order ? (
        <p role="alert" className="mt-6 text-lg text-error">
          {error}
        </p>
      ) : null}

      {phone === "" && !order && !loading ? (
        <form
          onSubmit={handlePhoneSubmit}
          noValidate
          className="mt-6 max-w-md space-y-4"
        >
          <div>
            <label
              htmlFor="confirmation-phone"
              className="mb-1 block font-semibold text-text"
            >
              Enter the phone number used for this order
            </label>
            <input
              id="confirmation-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
              aria-invalid={Boolean(phoneError)}
              aria-describedby={
                phoneError ? "confirmation-phone-error" : undefined
              }
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text"
            />
            {phoneError ? (
              <p
                id="confirmation-phone-error"
                className="mt-1 text-sm text-error"
              >
                {phoneError}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover"
          >
            Show my order
          </button>
        </form>
      ) : null}

      {order ? (
        <div className="mt-8 max-w-2xl space-y-8">
          <section
            aria-label="Order reference"
            className="rounded-lg border border-border bg-surface p-4"
          >
            <p className="text-sm font-semibold text-text-secondary">
              Your order reference
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-3">
              <span
                ref={referenceRef}
                className="font-display text-3xl font-bold tracking-wide text-text"
              >
                {order.reference}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-4 py-2 font-semibold text-text"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              Keep this reference — you need it with your phone number to
              track your order.
            </p>
          </section>

          <section aria-label="Items ordered">
            <h2 className="font-display text-xl font-bold text-text">
              Items
            </h2>
            <ul className="mt-3 space-y-2">
              {order.items.map((item) => (
                <li
                  key={`${item.productSlug}-${item.variantColour ?? "default"}`}
                  className="flex items-baseline justify-between gap-4 text-text"
                >
                  <span>
                    {item.productName}
                    {item.variantColour
                      ? ` — ${item.variantColour}`
                      : ""}
                    <span className="text-text-secondary">
                      {" "}
                      × {item.quantity}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold">
                    {formatPriceBdt(item.lineTotalBdt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Order totals">
            <dl className="space-y-1 text-text">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatPriceBdt(order.subtotalBdt)}</dd>
              </div>
              {/* S-7: discount line, only when a coupon was applied.
                  The Tax label stays hardcoded (5%) — the actual tax
                  rate is not in the order data, so it cannot be
                  shown here without a Slice B change. */}
              {(order.discountBdt ?? 0) > 0 ? (
                <div className="flex justify-between">
                  <dt>
                    Discount
                    {order.discountCode ? ` (${order.discountCode})` : ""}
                  </dt>
                  <dd>−{formatPriceBdt(order.discountBdt ?? 0)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>Tax (5%)</dt>
                <dd>{formatPriceBdt(order.taxBdt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Delivery fee</dt>
                <dd>{formatPriceBdt(order.deliveryFeeBdt)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
                <dt>Total</dt>
                <dd>{formatPriceBdt(order.totalBdt)}</dd>
              </div>
            </dl>
          </section>

          <section aria-label="Delivery and payment">
            <dl className="space-y-1 text-text">
              <div className="flex justify-between gap-4">
                <dt className="font-semibold">Delivery</dt>
                <dd className="text-right">
                  {DELIVERY_OPTIONS[order.deliveryZone].label} —{" "}
                  {DELIVERY_OPTIONS[order.deliveryZone].estimate}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-semibold">Payment method</dt>
                <dd className="text-right">
                  {paymentLabel(order.paymentMethod)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-semibold">Payment status</dt>
                <dd className="text-right">
                  {paymentStatusLabel(
                    order.paymentStatus,
                    order.paymentMethod,
                  )}
                </dd>
              </div>
              {isMobileBankingMethod(order.paymentMethod) &&
              order.paymentReference ? (
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold">Transaction ID</dt>
                  <dd className="text-right">{order.paymentReference}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <p>
            <Link
              href={`/orders?ref=${order.reference}`}
              className="inline-flex min-h-11 items-center rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover"
            >
              Track Your Order
            </Link>
          </p>
        </div>
      ) : null}
    </main>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
          <p className="text-lg text-text-secondary">Loading your order…</p>
        </main>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
