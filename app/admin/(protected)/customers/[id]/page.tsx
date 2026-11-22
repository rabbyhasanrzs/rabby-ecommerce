import { Suspense } from "react";
import {
  adminListCustomers,
  adminListOrders,
  orderStatusLabel,
} from "@/app/admin/(protected)/admin-data";
import { customerIdForPhone, isPhoneShaped } from "@/lib/customer-id";
import { formatPriceBdt } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

/**
 * Admin Customer detail (S-4, T-45; S-6 follow-up D-S6-4) — one
 * customer's orders, with reference, totals, payment and status, each
 * linking to the order detail. The orders come from admin_list_orders
 * filtered to this phone (the RPC has no phone filter; the grouping
 * RPC is the customer list). No sender numbers are shown anywhere.
 *
 * The route param is an OPAQUE id, not a phone number: the first 16
 * hex chars of SHA-256 of the customer's normalized phone (see
 * lib/customer-id). The server resolves it by hashing each customer's
 * phone and matching. A raw phone number as the param must NOT
 * resolve — it 404s (explicit guard below), so old
 * /admin/customers/01XXXXXXXXX URLs no longer open a customer.
 */
async function AdminCustomerDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  if (isPhoneShaped(decodedId)) {
    notFound();
  }
  const [customers, orders] = await Promise.all([
    adminListCustomers(),
    adminListOrders(null, 200, 0),
  ]);
  const customer = customers.find(
    (c) => customerIdForPhone(c.phone) === decodedId,
  );
  if (!customer) {
    notFound();
  }
  const customerOrders = orders.filter(
    (order) => order.customer_phone === customer.phone,
  );

  return (
    <div>
      <p className="text-sm">
        <Link href="/admin/customers" className="font-semibold text-action">
          ← Back to customers
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold text-text">
        {customer.name}
      </h1>
      <p className="mt-1 text-text-secondary">
        {customer.phone}
        {customer.email ? ` — ${customer.email}` : ""} ·{" "}
        {customer.order_count} order{customer.order_count === 1 ? "" : "s"} ·{" "}
        {formatPriceBdt(customer.total_spent_bdt)} spent
      </p>

      {customerOrders.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-text-secondary">
          No orders found for this customer.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Reference
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Payment
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Total
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {customerOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-3 font-semibold text-text">
                    <Link
                      href={`/admin/orders/${order.reference}`}
                      className="text-action underline"
                    >
                      {order.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text">
                    {order.payment_method} — {order.payment_status}
                  </td>
                  <td className="px-4 py-3 text-text">
                    {formatPriceBdt(order.total_bdt)}
                  </td>
                  <td className="px-4 py-3 text-text">
                    {orderStatusLabel(order.status)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(order.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminCustomerDetailPageContent params={params} />
    </Suspense>
  );
}
