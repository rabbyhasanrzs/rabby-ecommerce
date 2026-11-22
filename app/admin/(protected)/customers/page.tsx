import { Suspense } from "react";
import { adminListCustomers } from "@/app/admin/(protected)/admin-data";
import { customerIdForPhone } from "@/lib/customer-id";
import { formatPriceBdt } from "@/lib/format";
import Link from "next/link";
import { connection } from "next/server";

/**
 * Admin Customers (S-4, T-45; S-6 follow-up D-S6-4) — grouped-by-phone
 * view over orders. There is no customers table: guest checkout stores
 * customer data on the order, so a "customer" here is a phone number
 * with its orders grouped together. The phone is still DISPLAYED in
 * the table, but the link to a customer uses an opaque hash id
 * (lib/customer-id) — no phone number appears in any admin URL.
 */
async function AdminCustomersPageContent() {
  await connection();
  const customers = await adminListCustomers();

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-text">Customers</h1>
      <p className="mt-1 text-text-secondary">
        {customers.length} customer{customers.length === 1 ? "" : "s"} —
        grouped by phone number, from their orders.
      </p>

      {customers.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-text-secondary">
          No customers yet. Customers appear here after their first order.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Phone
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Orders
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Total spent
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Last order
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.phone}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-3 font-semibold text-text">
                    <Link
                      href={`/admin/customers/${customerIdForPhone(customer.phone)}`}
                      className="text-action underline"
                    >
                      {customer.phone}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text">{customer.name}</td>
                  <td className="px-4 py-3 text-text">
                    {customer.order_count}
                  </td>
                  <td className="px-4 py-3 text-text">
                    {formatPriceBdt(customer.total_spent_bdt)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(customer.last_order_at).toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
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

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminCustomersPageContent />
    </Suspense>
  );
}
