import { Suspense } from "react";
import { adminDashboardStats } from "@/app/admin/(protected)/admin-data";
import Sparkline from "@/components/admin/sparkline";
import { getRevenueSeries } from "@/lib/admin-analytics";
import { formatPriceBdt } from "@/lib/format";
import Link from "next/link";
import { connection } from "next/server";

/**
 * Admin Dashboard (S-4, T-41) — the store at a glance. Each summary
 * card is a link to the page that explains it. The revenue sparkline
 * reads real order data through Slice C's getRevenueSeries(7); with
 * no orders it says "No orders yet" instead of drawing a flat line.
 */

export async function AdminDashboardPageContent() {
  await connection();
  const [stats, revenue] = await Promise.all([
    adminDashboardStats(),
    getRevenueSeries(7),
  ]);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-text">Dashboard</h1>
      <p className="mt-1 text-text-secondary">
        The store at a glance. Pick a card to see the detail.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/orders"
          className="rounded-lg border border-border bg-surface p-4 hover:border-border-strong"
        >
          <span className="block text-sm font-semibold text-text-secondary">
            Orders to fulfil
          </span>
          <span className="mt-1 block font-display text-3xl font-bold text-text">
            {stats.orders_to_fulfil}
          </span>
          <span className="mt-1 block text-sm text-action">
            View orders →
          </span>
        </Link>
        <Link
          href="/admin/inventory"
          className="rounded-lg border border-border bg-surface p-4 hover:border-border-strong"
        >
          <span className="block text-sm font-semibold text-text-secondary">
            Low stock
          </span>
          <span className="mt-1 block font-display text-3xl font-bold text-text">
            {stats.low_stock_count}
          </span>
          <span className="mt-1 block text-sm text-action">
            View inventory →
          </span>
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-lg border border-border bg-surface p-4 hover:border-border-strong"
        >
          <span className="block text-sm font-semibold text-text-secondary">
            New orders (7 days)
          </span>
          <span className="mt-1 block font-display text-3xl font-bold text-text">
            {stats.new_orders_7d}
          </span>
          <span className="mt-1 block text-sm text-action">
            View orders →
          </span>
        </Link>
      </div>

      <section
        aria-labelledby="revenue-heading"
        className="mt-6 rounded-lg border border-border bg-surface p-4"
      >
        <h2
          id="revenue-heading"
          className="font-display text-xl font-bold text-text"
        >
          Revenue — last 7 days
        </h2>
        <div className="mt-3">
          <Sparkline data={revenue} />
        </div>
        <p className="mt-2">
          <Link
            href="/admin/analytics"
            className="font-semibold text-action underline"
          >
            See full sales &amp; revenue analytics →
          </Link>
        </p>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="recent-orders-heading"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2
            id="recent-orders-heading"
            className="font-display text-xl font-bold text-text"
          >
            Recent orders
          </h2>
          {stats.recent_orders.length === 0 ? (
            <p className="mt-3 text-text-secondary">No orders yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stats.recent_orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.reference}`}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-background-subtle"
                  >
                    <span>
                      <span className="block font-semibold text-text">
                        {order.reference}
                      </span>
                      <span className="block text-sm text-text-secondary">
                        {order.customer_name} — {order.status}
                      </span>
                    </span>
                    <span className="font-semibold text-text">
                      {formatPriceBdt(order.total_bdt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="low-stock-heading"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2
            id="low-stock-heading"
            className="font-display text-xl font-bold text-text"
          >
            Low stock
          </h2>
          {stats.low_stock.length === 0 ? (
            <p className="mt-3 text-text-secondary">
              No products are low on stock.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stats.low_stock.map((item) => (
                <li key={item.slug}>
                  <Link
                    href="/admin/inventory"
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-background-subtle"
                  >
                    <span className="font-semibold text-text">
                      {item.name}
                    </span>
                    <span className="text-sm font-semibold text-stock-low">
                      Only {item.stock_total} left
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminDashboardPageContent />
    </Suspense>
  );
}
