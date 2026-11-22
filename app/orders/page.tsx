"use client";

import OrderTimeline from "@/components/order-timeline";
import {
  DELIVERY_OPTIONS,
  PAYMENT_METHODS,
} from "@/lib/demo-config";
import { formatPriceBdt } from "@/lib/format";
import { maskDeliveryAddress } from "@/lib/mask-address";
import {
  isCancellableStatus,
  isMobileBankingMethod,
  paymentStatusLabel,
  type OrderDetail,
} from "@/lib/supabase/orders";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

/**
 * Track Order page (S-2, T-24).
 *
 * Look up a guest order by reference + phone, show the order detail
 * with the 7-step timeline, and let the customer cancel before the
 * order ships (two-step confirm; stock is restored on the server).
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

function TrackOrderContent() {
  const searchParams = useSearchParams();
  const prefilledReference = searchParams.get("ref") ?? "";

  const [reference, setReference] = useState(prefilledReference);
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function handleLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCancelMessage(null);
    setConfirmingCancel(false);
    if (!reference.trim() || !phone.trim()) {
      setError("Enter your order reference and phone number.");
      return;
    }
    setLoading(true);
    try {
      const found = await lookupOrder(reference.trim(), phone.trim());
      if (found) {
        setOrder(found);
      } else {
        setOrder(null);
        setError(NOT_FOUND_MESSAGE);
      }
    } catch {
      setOrder(null);
      setError(NOT_FOUND_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!order) {
      return;
    }
    setCancelling(true);
    try {
      const response = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: order.reference, phone }),
      });
      const data: { ok?: boolean; error?: string } =
        await response.json();
      if (data.ok) {
        setConfirmingCancel(false);
        setCancelMessage("Order cancelled. Stock has been restored.");
        const refreshed = await lookupOrder(order.reference, phone);
        if (refreshed) {
          setOrder(refreshed);
        }
      } else if (data.error === "too_late") {
        setConfirmingCancel(false);
        setCancelMessage(
          "This order has already shipped and can no longer be cancelled.",
        );
      } else {
        setConfirmingCancel(false);
        setCancelMessage(NOT_FOUND_MESSAGE);
      }
    } catch {
      setConfirmingCancel(false);
      setCancelMessage(NOT_FOUND_MESSAGE);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        Track your order
      </h1>

      <form
        onSubmit={handleLookup}
        noValidate
        className="mt-8 max-w-md space-y-4"
      >
        <div>
          <label
            htmlFor="track-reference"
            className="mb-1 block font-semibold text-text"
          >
            Order reference
          </label>
          <input
            id="track-reference"
            name="reference"
            type="text"
            autoComplete="off"
            placeholder="RB-2026-123456"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text"
          />
        </div>
        <div>
          <label
            htmlFor="track-phone"
            className="mb-1 block font-semibold text-text"
          >
            Phone number
          </label>
          <input
            id="track-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="min-h-11 rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Looking up your order…" : "Track order"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-6 text-lg text-error">
          {error}
        </p>
      ) : null}

      {cancelMessage ? (
        <p role="status" className="mt-6 text-lg font-semibold text-text">
          {cancelMessage}
        </p>
      ) : null}

      {order ? (
        <div className="mt-10 max-w-2xl space-y-8">
          <section aria-label="Order summary">
            <h2 className="font-display text-xl font-bold text-text">
              Order {order.reference}
            </h2>
            <dl className="mt-3 space-y-1 text-text">
              <div className="flex justify-between gap-4">
                <dt className="font-semibold">Name</dt>
                <dd className="text-right">{order.customerName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-semibold">Delivery address</dt>
                {/* S-6 (D-S6-6): masked on the track page only — house /
                    road / flat hidden, area + city visible. The shared
                    OrderDetail still carries the full address, so the
                    confirmation page and the admin area are unaffected. */}
                <dd className="text-right">
                  {maskDeliveryAddress(order.deliveryAddress)}
                </dd>
              </div>
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
              <div className="flex justify-between gap-4">
                <dt className="font-semibold">Placed on</dt>
                <dd className="text-right">
                  {new Date(order.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-label="Order status">
            <h2 className="font-display text-xl font-bold text-text">
              Order status
            </h2>
            <div className="mt-3">
              <OrderTimeline status={order.status} events={order.events} />
            </div>
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
            <dl className="mt-4 space-y-1 border-t border-border pt-3 text-text">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatPriceBdt(order.subtotalBdt)}</dd>
              </div>
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

          {isCancellableStatus(order.status) ? (
            <section aria-label="Cancel order">
              {confirmingCancel ? (
                <div className="rounded-md border border-border bg-surface p-4">
                  <p className="font-semibold text-text">
                    Cancel this order?
                  </p>
                  <p className="mt-1 text-text-secondary">
                    The items will go back in stock.
                  </p>
                  <p className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="min-h-11 rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {cancelling
                        ? "Cancelling…"
                        : "Confirm cancellation"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingCancel(false)}
                      className="min-h-11 rounded-md border border-border bg-surface px-6 py-3 font-semibold text-text"
                    >
                      Keep order
                    </button>
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(true)}
                  className="min-h-11 rounded-md border border-error bg-surface px-6 py-3 font-semibold text-error"
                >
                  Cancel order
                </button>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
          <p className="text-lg text-text-secondary">
            Loading track order…
          </p>
        </main>
      }
    >
      <TrackOrderContent />
    </Suspense>
  );
}
