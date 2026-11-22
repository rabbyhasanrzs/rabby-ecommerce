import { Suspense } from "react";
import {
  adminGetProduct,
  adminListCategories,
} from "@/app/admin/(protected)/admin-data";
import ProductForm from "@/components/admin/product-form";
import { notFound } from "next/navigation";
import { connection } from "next/server";

/** Edit Product page (S-4, T-42). Keeps the existing photo unless a
 *  new one is uploaded. */
async function AdminProductEditPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const [found, categories] = await Promise.all([
    adminGetProduct(id),
    adminListCategories(),
  ]);
  if (!found) {
    notFound();
  }
  const { product, colour, imageUrl } = found;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-text">
        Edit Product
      </h1>
      <p className="mt-1 text-text-secondary">{product.name}</p>
      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <ProductForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          initial={{
            id: product.id,
            name: product.name,
            categoryId: product.category_id,
            priceBdt: product.price_bdt,
            stockTotal: product.stock_total,
            status: product.status === "inactive" ? "inactive" : "active",
            description: product.description ?? "",
            colour: colour ?? "Black",
            imageUrl,
          }}
          mode="edit"
        />
      </div>
    </div>
  );
}

export default function AdminProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminProductEditPageContent params={params} />
    </Suspense>
  );
}
