import { Suspense } from "react";
import {
  adminListOrders,
  orderStatusLabel,
} from "@/app/admin/(protected)/admin-data";
import { formatPriceBdt } from "@/lib/format";
import Link from "next/link";
import { connection } from "next/server";

/**
 * Admin Orders (S-4, T-46) — table with a status filter and search
 * by reference or phone (GET form, no JavaScript needed). The list
 * comes from admin_list_orders; search filters the fetched page.
 */

const STATUS_OPTIONS = [
  "placed",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "failed",
  "returned",
  "refunded",
] as const;

async function AdminOrdersPageContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const raw = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  const statusFilter =
    flat.status && (STATUS_OPTIONS as readonly string[]).includes(flat.status)
      ? flat.status
      : "";
  const query = (flat.q ?? "").trim().toLowerCase();

  const orders = await adminListOrders(statusFilter || null, 100, 0);
  const visible = query
    ? orders.filter(
        (order) =>
          order.reference.toLowerCase().includes(query) ||
          order.customer_phone.toLowerCase().includes(query),
      )
    : orders;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-text">Orders</h1>
      <p className="mt-1 text-text-secondary">
        {visible.length} order{visible.length === 1 ? "" : "s"}.
      </p>

      <form
        method="get"
        action="/admin/orders"
        className="mt-6 flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">
            Status
          </span>
          <select
            name="status"
            defaultValue={statusFilter}
            className="h-11 rounded-md border border-border bg-background px-3 text-base text-text"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {orderStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-sm font-semibold text-text">
            Search by reference or phone
          </span>
          <input
            type="search"
            name="q"
            defaultValue={flat.q ?? ""}
            placeholder="RB-2026-123456 or 017…"
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-text placeholder:text-text-secondary"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 self-end rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover"
        >
          Search
        </button>
      </form>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-text-secondary">
          No orders match.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Reference
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Customer
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Zone
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
              {visible.map((order) => (
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
                    {order.customer_name}
                    <span className="block text-text-secondary">
                      {order.customer_phone}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text">
                    {order.zone === "inside" ? "Inside Dhaka" : "Outside Dhaka"}
                  </td>
                  <td className="px-4 py-3 text-text">
                    {order.payment_method}
                    <span className="block text-text-secondary">
                      {order.payment_status}
                    </span>
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

export default function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminOrdersPageContent searchParams={searchParams} />
    </Suspense>
  );
}
