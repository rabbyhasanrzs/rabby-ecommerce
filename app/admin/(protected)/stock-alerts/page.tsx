import {
  adminListStockAlertSubscriptions,
  type AdminStockAlertSubscription,
} from "@/app/admin/(protected)/admin-data";
import { connection } from "next/server";

/**
 * Admin Stock Alerts (S-7; no documented scope, owner-approved
 * standard setup) — the subscriber list for back-in-stock alerts.
 *
 * One row per subscription: product, subscriber email, status, when
 * they subscribed, when the alert went out. Pending rows are the
 * people waiting now; sent rows are consumed (one alert per
 * subscription — they never alert again); unsubscribed rows opted
 * out through the link in the email.
 *
 * When migration 0013 has not run yet (the code deploys before the
 * owner runs the SQL), the list call throws — the page says so
 * plainly instead of erroring.
 */

const STATUS_OPTIONS = ["pending", "sent", "unsubscribed"] as const;

const STATUS_LABEL: Record<AdminStockAlertSubscription["status"], string> = {
  pending: "Pending",
  sent: "Sent",
  unsubscribed: "Unsubscribed",
};

function formatAlertDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function AdminStockAlertsPageContent({
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
    flat.status &&
    (STATUS_OPTIONS as readonly string[]).includes(flat.status)
      ? (flat.status as AdminStockAlertSubscription["status"])
      : null;

  let subscriptions: AdminStockAlertSubscription[] | null = null;
  try {
    subscriptions = await adminListStockAlertSubscriptions(
      null,
      statusFilter,
    );
  } catch {
    subscriptions = null;
  }

  if (subscriptions === null) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold text-text">
          Stock Alerts
        </h1>
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-text-secondary">
          Stock alerts are not set up yet. Run migration 0013 in the
          Supabase SQL Editor first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-text">
        Stock Alerts
      </h1>
      <p className="mt-1 text-text-secondary">
        {subscriptions.length} subscription
        {subscriptions.length === 1 ? "" : "s"}
        {statusFilter ? ` — ${STATUS_LABEL[statusFilter].toLowerCase()}` : ""}.
        Pending subscriptions are waiting for a restock; sent ones
        already got their one alert.
      </p>

      <form
        method="get"
        action="/admin/stock-alerts"
        className="mt-6 flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">
            Status
          </span>
          <select
            name="status"
            defaultValue={statusFilter ?? ""}
            className="h-11 rounded-md border border-border bg-background px-3 text-base text-text"
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="mt-5 min-h-11 rounded-md bg-action px-4 py-2 font-semibold text-text-inverse hover:bg-action-hover"
        >
          Filter
        </button>
      </form>

      {subscriptions.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-text-secondary">
          No stock alert subscriptions yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Product
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Email
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Subscribed
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Alert sent
                </th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-3 font-semibold text-text">
                    {row.product_name}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {row.email}
                  </td>
                  <td className="px-4 py-3 text-text">
                    {STATUS_LABEL[row.status]}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {formatAlertDate(row.created_at)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {formatAlertDate(row.sent_at)}
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

export default function AdminStockAlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <AdminStockAlertsPageContent searchParams={searchParams} />
  );
}
