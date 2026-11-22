import { Suspense } from "react";
import {
  adminClient,
  adminListCategories,
} from "@/app/admin/(protected)/admin-data";
import CategoryManager from "@/components/admin/category-manager";
import { connection } from "next/server";

/**
 * Admin Categories (S-4, T-43) — list + Add / Edit / Remove.
 * The product count per category is shown so the owner can see why
 * a category does (or does not) appear on the storefront: only
 * categories with ≥1 active product are listed there
 * (listCategories in lib/supabase/catalog.ts).
 */
async function AdminCategoriesPageContent() {
  await connection();
  const categories = await adminListCategories();
  const supabase = await adminClient();
  const { data: products } = await supabase
    .from("products")
    .select("category_id")
    .eq("status", "active");
  const counts = new Map<string, number>();
  for (const row of (products as { category_id: string | null }[] | null) ??
    []) {
    if (row.category_id) {
      counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-text">
        Categories
      </h1>
      <p className="mt-1 text-text-secondary">
        A category appears on the storefront only once it has at least
        one active product. A category with products cannot be removed.
      </p>
      <div className="mt-6">
        <CategoryManager
          categories={categories.map((category) => ({
            id: category.id,
            slug: category.slug,
            name: category.name,
            sort_order: category.sort_order,
            productCount: counts.get(category.id) ?? 0,
          }))}
        />
      </div>
    </div>
  );
}

export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<p className="mt-6 text-text-secondary">Loading…</p>}>
      <AdminCategoriesPageContent />
    </Suspense>
  );
}
