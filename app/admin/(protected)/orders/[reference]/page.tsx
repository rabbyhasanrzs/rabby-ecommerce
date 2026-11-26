import { Suspense } from "react";
import {
  adminGetOrder,
  allowedTargetStatuses,
  orderStatusLabel,
  ORDER_STATUS_LABELS,
} from "@/app/admin/(protected)/admin-data";
import OrderStatusForm from "@/components/admin/order-status-form";
import PaymentStatusControl from "@/components/admin/payment-status-control";
import OrderTimeline from "@/components/order-timeline";
import { DELIVERY_OPTIONS, PAYMENT_METHODS } from "@/lib/demo-config";
import { formatPriceBdt } from "@/lib/format";
import { paymentStatusLabel } from "@/lib/supabase/orders";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

/**
 * Admin Order detail (S-4, T-46) — customer/phone, address/zone,
 * payment (method, status, TrxID where present — the sender number
 * is NEVER rendered, S-3 rule), items × qty, totals, times, the
 * 7-step timeline, and the status + payment update controls. A
 * status update writes order_status_events, so the customer timeline
 * (which reads those events) reflects it.
 */
async function AdminOrderDetailPageContent({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  await connection();
  const { reference } = await params;
  const detail = await adminGetOrder(reference);
  if (!detail) {
    notFound();
  }
  const { order, items, status_events, payment } = detail;
  const subtotal =
    order.subtotal_bdt ??
    items.reduce((sum, item) => sum + item.price_bdt * item.quantity, 0);
  const paymentMethodLabel =
    PAYMENT_METHODS.find((method) => method.id === order.payment_method)
      ?.label ?? order.payment_method;
  // S-7: the gateway record, if the order has one — a single
  // non-null handle so the JSX below does not re-check null.
  const gateway =
    payment &&
    (payment.gateway_val_id ||
      payment.gateway_bank_tran_id ||
      payment.gateway_card_brand ||
      payment.gateway_store_amount_bdt !== null ||
      payment.gateway_session_key)
      ? payment
      : null;
  const zoneLabel =
    DELIVERY_OPTIONS[order.zone as "inside" | "outside"]?.label ?? order.zone;

  return (
    <div>
      <p className="text-sm">
        <Link href="/admin/orders" className="font-semibold text-action">
          ← Back to orders
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold text-text">
        {order.reference}
      </h1>
      <p className="mt-1 text-text-secondary">
        Placed{" "}
        {new Date(order.created_at).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        · Status: {orderStatusLabel(order.status)}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="customer-heading"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2
            id="customer-heading"
            className="font-display text-xl font-bold text-text"
          >
            Customer
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Name</dt>
              <dd className="font-semibold text-text">
                {order.customer_name}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Phone</dt>
              <dd className="font-semibold text-text">
                {order.customer_phone}
              </dd>
            </div>
            {order.customer_email ? (
              <div className="flex justify-between gap-4">
                <dt className="text-text-secondary">Email</dt>
                <dd className="font-semibold text-text">
                  {order.customer_email}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Address</dt>
              <dd className="text-right font-semibold text-text">
                {order.address}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Zone</dt>
              <dd className="font-semibold text-text">{zoneLabel}</dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="payment-heading"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2
            id="payment-heading"
            className="font-display text-xl font-bold text-text"
          >
            Payment
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Method</dt>
              <dd className="font-semibold text-text">
                {paymentMethodLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Status</dt>
              <dd className="font-semibold text-text">
                {paymentStatusLabel(
                  payment?.status ?? order.payment_status,
                  order.payment_method,
                )}
              </dd>
            </div>
            {payment?.reference || order.payment_reference ? (
              <div className="flex justify-between gap-4">
                <dt className="text-text-secondary">Transaction ID</dt>
                <dd className="font-semibold text-text">
                  {payment?.reference ?? order.payment_reference}
                </dd>
              </div>
            ) : null}
            {gateway ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-text-secondary">Gateway</dt>
                  <dd className="font-semibold text-text">SSLCommerz</dd>
                </div>
                {gateway.gateway_session_key ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-secondary">Session key</dt>
                    <dd className="break-all text-right font-semibold text-text">
                      {gateway.gateway_session_key}
                    </dd>
                  </div>
                ) : null}
                {gateway.gateway_val_id ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-secondary">Validation ID</dt>
                    <dd className="break-all text-right font-semibold text-text">
                      {gateway.gateway_val_id}
                    </dd>
                  </div>
                ) : null}
                {gateway.gateway_bank_tran_id ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-secondary">
                      Bank transaction ID
                    </dt>
                    <dd className="break-all text-right font-semibold text-text">
                      {gateway.gateway_bank_tran_id}
                    </dd>
                  </div>
                ) : null}
                {gateway.gateway_card_brand ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-secondary">Card / channel</dt>
                    <dd className="font-semibold text-text">
                      {gateway.gateway_card_brand}
                    </dd>
                  </div>
                ) : null}
                {gateway.gateway_store_amount_bdt !== null ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-secondary">Amount received</dt>
                    <dd className="font-semibold text-text">
                      {formatPriceBdt(gateway.gateway_store_amount_bdt)}
                    </dd>
                  </div>
                ) : null}
                {gateway.gateway_risk_level === 1 ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-secondary">Risk</dt>
                    <dd className="font-semibold text-warning">
                      Flagged as risky — review before shipping
                    </dd>
                  </div>
                ) : null}
              </>
            ) : null}
          </dl>
          {(payment?.status ?? order.payment_status) === "pending" ? (
            <div className="mt-4 border-t border-border pt-4">
              <PaymentStatusControl reference={order.reference} />
            </div>
          ) : null}
        </section>
      </div>

      <section
        aria-labelledby="items-heading"
        className="mt-6 rounded-lg border border-border bg-surface p-4"
      >
        <h2
          id="items-heading"
          className="font-display text-xl font-bold text-text"
        >
          Items
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((item) => (
            <li
              key={`${item.slug}-${item.variant_colour ?? ""}`}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-text">
                {item.name}
                {item.variant_colour ? ` (${item.variant_colour})` : ""} ×{" "}
                {item.quantity}
              </span>
              <span className="font-semibold text-text">
                {formatPriceBdt(item.price_bdt * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Subtotal</dt>
            <dd className="font-semibold text-text">
              {formatPriceBdt(subtotal)}
            </dd>
          </div>
          {/* S-7: applied coupon code + discount, only when a coupon
              was applied (discount_bdt / discount_code come from
              admin_get_order). */}
          {(order.discount_bdt ?? 0) > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">
                Discount
                {order.discount_code ? ` (${order.discount_code})` : ""}
              </dt>
              <dd className="font-semibold text-text">
                −{formatPriceBdt(order.discount_bdt ?? 0)}
              </dd>
            </div>
          ) : null}
          {order.tax_bdt !== null && order.tax_bdt !== undefined ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Tax</dt>
              <dd className="font-semibold text-text">
                {formatPriceBdt(order.tax_bdt)}
              </dd>
            </div>
          ) : null}
          {order.delivery_fee_bdt !== null &&
          order.delivery_fee_bdt !== undefined ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Delivery</dt>
              <dd className="font-semibold text-text">
                {formatPriceBdt(order.delivery_fee_bdt)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 text-base">
            <dt className="font-bold text-text">Total</dt>
            <dd className="font-bold text-text">
              {formatPriceBdt(order.total_bdt)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="timeline-heading"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2
            id="timeline-heading"
            className="font-display text-xl font-bold text-text"
          >
            Timeline
          </h2>
          <div className="mt-3">
            <OrderTimeline
              status={order.status}
              events={status_events.map((event) => ({
                fromStatus: null,
                toStatus: event.status,
                createdAt: event.created_at,
              }))}
            />
          </div>
          {status_events.length > 0 ? (
            <ul className="mt-4 space-y-1 border-t border-border pt-3 text-sm text-text-secondary">
              {status_events.map((event, index) => (
                <li key={`${event.status}-${index}`}>
                  {orderStatusLabel(event.status)} —{" "}
                  {new Date(event.created_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {event.note ? ` — ${event.note}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section
          aria-labelledby="update-heading"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2
            id="update-heading"
            className="font-display text-xl font-bold text-text"
          >
            Update status
          </h2>
          <div className="mt-3">
            <OrderStatusForm
              reference={order.reference}
              currentStatus={order.status}
              allowedStatuses={allowedTargetStatuses(order.status)}
              statusLabels={ORDER_STATUS_LABELS}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AdminOrderDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminOrderDetailPageContent params={params} />
    </Suspense>
  );
}
