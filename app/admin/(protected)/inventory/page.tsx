import { Suspense } from "react";
import {
  adminClient,
  adminListProducts,
} from "@/app/admin/(protected)/admin-data";
import InventoryRow from "@/components/admin/inventory-row";
import { connection } from "next/server";

/**
 * Admin Inventory (S-4, T-44) — stock table with a Save button per
 * row. Stock is tracked at product level (products.stock_total);
 * the colour shown is the product's first variant. A saved change
 * writes stock_total, which the storefront reads — shoppers see it
 * immediately.
 */
async function AdminInventoryPageContent() {
  await connection();
  const products = await adminListProducts();
  // First variant colour per product (stock itself is product-level).
  const supabase = await adminClient();
  const { data: variants } = await supabase
    .from("product_variants")
    .select("product_id,colour,sort_order")
    .in(
      "product_id",
      products.map((product) => product.id),
    )
    .order("sort_order", { ascending: true });
  const colourByProduct = new Map<string, string>();
  for (const row of (variants as
    | { product_id: string; colour: string }[]
    | null) ?? []) {
    if (!colourByProduct.has(row.product_id)) {
      colourByProduct.set(row.product_id, row.colour);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-text">Inventory</h1>
      <p className="mt-1 text-text-secondary">
        Stock is saved row by row. A product with 2 or fewer left is
        flagged Low stock.
      </p>
      {products.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-text-secondary">
          No products yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Product
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Colour
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Stock
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <span className="sr-only">Save</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <InventoryRow
                  key={product.id}
                  productId={product.id}
                  productName={product.name}
                  colour={colourByProduct.get(product.id) ?? null}
                  stockTotal={product.stock_total}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminInventoryPage() {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminInventoryPageContent />
    </Suspense>
  );
}
