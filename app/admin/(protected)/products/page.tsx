import { Suspense } from "react";
import {
  adminListCategories,
  adminListProducts,
} from "@/app/admin/(protected)/admin-data";
import { formatPriceBdt } from "@/lib/format";
import Link from "next/link";
import { connection } from "next/server";

/**
 * Admin Products (S-4, T-42) — table of every product (active and
 * inactive), with Edit per row and an Add Product button. The DEMO
 * flag marks the seeded demo products; admin-added products are real
 * (is_demo = false).
 */
async function AdminProductsPageContent() {
  await connection();
  const [products, categories] = await Promise.all([
    adminListProducts(),
    adminListCategories(),
  ]);
  const categoryName = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">
            Products
          </h1>
          <p className="mt-1 text-text-secondary">
            {products.length} product{products.length === 1 ? "" : "s"}.
            Added products appear on the storefront.
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="min-h-11 rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover"
        >
          Add Product
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-text-secondary">
          No products yet. Add the first one.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Category
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Price
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Stock
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Demo
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-3 font-semibold text-text">
                    {product.name}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {product.category_id
                      ? (categoryName.get(product.category_id) ?? "—")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-text">
                    {formatPriceBdt(product.price_bdt)}
                  </td>
                  <td className="px-4 py-3 text-text">
                    {product.stock_total}
                    {product.stock_total <= 2 ? (
                      <span className="ml-2 font-semibold text-stock-low">
                        Low
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-text">{product.status}</td>
                  <td className="px-4 py-3 text-text">
                    {product.is_demo ? "DEMO" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="font-semibold text-action underline"
                    >
                      Edit
                    </Link>
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

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminProductsPageContent />
    </Suspense>
  );
}
