import { Suspense } from "react";
import { adminListCategories } from "@/app/admin/(protected)/admin-data";
import ProductForm from "@/components/admin/product-form";
import { connection } from "next/server";

/** Add Product page (S-4, T-42). */
async function AdminProductNewPageContent() {
  await connection();
  const categories = await adminListCategories();

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-text">
        Add Product
      </h1>
      <p className="mt-1 text-text-secondary">
        A product needs a price, a photo and stock before it can be saved.
        It appears on the storefront as soon as it is active.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <ProductForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          initial={null}
          mode="add"
        />
      </div>
    </div>
  );
}

export default function AdminProductNewPage() {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminProductNewPageContent />
    </Suspense>
  );
}
