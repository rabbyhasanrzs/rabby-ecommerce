import { getSupabaseClient } from "@/lib/supabase/client";
import { z } from "zod";

/**
 * Catalogue data layer — S-1 read-only.
 *
 * Matches supabase/migrations/0001_s1_catalogue.sql exactly:
 *   categories (id, slug, name, sort_order, is_active)
 *   products (id, slug, name, description, category_id, price_bdt,
 *     stock_total, status, is_demo, created_at, updated_at)
 *   product_variants (id, product_id, colour, price_bdt NULL,
 *     stock_quantity NULL, sort_order)
 *   product_images (id, product_id, storage_path, alt_text,
 *     sort_order, is_primary)
 *   product_measurements (id, product_id, lens_width_mm, bridge_mm,
 *     temple_mm, frame_width_mm, lens_height_mm, face_shape_ratings JSONB)
 *
 * All queries go through the Supabase client (parameterised by the
 * client library) — no raw SQL in app code. Reads only; there is no
 * write path in S-1 and RLS denies anon writes on every table.
 *
 * Variant stock note (migration §1): demo data tracks stock only at
 * product level (products.stock_total). product_variants.stock_quantity
 * is NULL for every seeded variant — do NOT invent a per-variant split.
 * A variant is available iff its product has stock_total > 0 and
 * status = 'active'.
 */

// ---------------------------------------------------------------------------
// Validation (audit G-M4): Zod on every input; slug allowlist.
// ---------------------------------------------------------------------------

/** Slug allowlist — anything else is a 404, never a query. */
export const slugSchema = z
  .string()
  // S-6 (T-61, S6-25): a length bound for defence in depth (the
  // regex alone allows an arbitrarily long slug).
  .max(100)
  .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, digits, and hyphens.");

export function isValidSlug(slug: string): boolean {
  return slugSchema.safeParse(slug).success;
}

export const listingSortSchema = z.enum([
  "featured",
  "price-asc",
  "price-desc",
  "newest",
]);
export type ListingSort = z.infer<typeof listingSortSchema>;

/** Listing query params, as they arrive from the URL (?search=&category=&…). */
export const listingParamsSchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  category: slugSchema.optional().default(""),
  sort: listingSortSchema.optional().default("featured"),
  priceMin: z.coerce.number().int().min(0).max(1_000_000).optional(),
  priceMax: z.coerce.number().int().min(0).max(1_000_000).optional(),
  inStockOnly: z
    .enum(["true", "false", "1", "0", "on"])
    .optional()
    .transform((v) => v === "true" || v === "1" || v === "on"),
});
export type ListingParams = z.infer<typeof listingParamsSchema>;

/** Parse raw URL params; invalid values fall back to defaults (never throw). */
export function parseListingParams(
  raw: Record<string, string | string[] | undefined>,
): ListingParams {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  const parsed = listingParamsSchema.safeParse(flat);
  if (parsed.success) {
    return parsed.data;
  }
  // Unknown sort/category values etc. -> safe defaults, not an error page.
  return listingParamsSchema.parse({});
}

// ---------------------------------------------------------------------------
// Types (row shapes from the migration)
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  price_bdt: number;
  stock_total: number;
  is_demo: boolean;
  created_at: string;
  /** Primary product photo path (e.g. "/images/sample-round-a.webp"), or null if none. */
  primary_image: string | null;
}

export interface ProductVariant {
  id: string;
  colour: string;
  /** NULL = use the product's price_bdt (no per-variant price in demo data). */
  price_bdt: number | null;
  /** NULL = per-variant stock NOT tracked in demo data (see note above). */
  stock_quantity: number | null;
  sort_order: number;
}

export interface ProductImage {
  id: string;
  /** e.g. "/images/sample-round-a.webp" — served from public/images/. */
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
}

export interface ProductMeasurements {
  lens_width_mm: number | null;
  bridge_mm: number | null;
  temple_mm: number | null;
  frame_width_mm: number | null;
  lens_height_mm: number | null;
  /** e.g. {"Round":"fair","Square":"excellent","Oval":"excellent","Heart":"good"} */
  face_shape_ratings: Record<string, string> | null;
}

export interface ProductDetail extends ProductSummary {
  variants: ProductVariant[];
  images: ProductImage[];
  measurements: ProductMeasurements | null;
}

// ---------------------------------------------------------------------------
// Pure filter / sort logic (unit-tested; no Supabase needed)
// ---------------------------------------------------------------------------

export function applyListingFilters(
  products: ProductSummary[],
  params: ListingParams,
): ProductSummary[] {
  const needle = params.search.trim().toLowerCase();
  return products.filter((p) => {
    if (params.category && p.category_slug !== params.category) {
      return false;
    }
    if (needle) {
      const haystack = `${p.name} ${p.description ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) {
        return false;
      }
    }
    if (params.priceMin !== undefined && p.price_bdt < params.priceMin) {
      return false;
    }
    if (params.priceMax !== undefined && p.price_bdt > params.priceMax) {
      return false;
    }
    if (params.inStockOnly && p.stock_total <= 0) {
      return false;
    }
    return true;
  });
}

export function sortProducts(
  products: ProductSummary[],
  sort: ListingSort,
): ProductSummary[] {
  const sorted = [...products];
  switch (sort) {
    case "price-asc":
      sorted.sort((a, b) => a.price_bdt - b.price_bdt);
      break;
    case "price-desc":
      sorted.sort((a, b) => b.price_bdt - a.price_bdt);
      break;
    case "newest":
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    case "featured":
    default:
      // Featured = catalogue order: category, then name.
      sorted.sort((a, b) =>
        (a.category_slug ?? "").localeCompare(b.category_slug ?? "") ||
        a.name.localeCompare(b.name),
      );
      break;
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Supabase reads (anon SELECT only; RLS limits rows to public ones)
// ---------------------------------------------------------------------------

/** Thrown when the catalogue cannot be read (no env vars, no tables yet, network). Pages catch this and render the "catalogue unavailable" state — never a stack trace. */
export class CatalogueUnavailableError extends Error {
  constructor() {
    super("Catalogue unavailable");
    this.name = "CatalogueUnavailableError";
  }
}

const productColumns =
  "id,slug,name,description,category_id,price_bdt,stock_total,is_demo,created_at";

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category_id: string | null;
  price_bdt: number;
  stock_total: number;
  is_demo: boolean;
  created_at: string;
  categories: { slug: string; name: string } | null;
}

function toProductSummary(row: ProductRow): ProductSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category_id: row.category_id,
    category_slug: row.categories?.slug ?? null,
    category_name: row.categories?.name ?? null,
    price_bdt: row.price_bdt,
    stock_total: row.stock_total,
    is_demo: row.is_demo,
    created_at: row.created_at,
    primary_image: null,
  };
}

/**
 * Active categories that have at least one active product (S-4, T-43).
 *
 * Rule (Phase 05 / FR-12): a category appears in storefront
 * navigation only with ≥1 product. The old version returned every
 * active category, so an empty category showed up in the listing
 * filter with zero products behind it. The change is minimal: one
 * extra read of active products' category_ids, then a filter in
 * memory. A category with products that are all inactive (or none
 * at all) is left out until it has an active product.
 */
export async function listCategories(): Promise<Category[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new CatalogueUnavailableError();
  }
  const [{ data, error }, productsRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id,slug,name,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("products").select("category_id").eq("status", "active"),
  ]);
  if (error || !data || productsRes.error || !productsRes.data) {
    throw new CatalogueUnavailableError();
  }
  const withProducts = new Set(
    (productsRes.data as { category_id: string | null }[])
      .map((row) => row.category_id)
      .filter((id): id is string => id !== null),
  );
  return (data as Category[]).filter((category) =>
    withProducts.has(category.id),
  );
}

export async function listProducts(
  params: ListingParams,
): Promise<{ products: ProductSummary[]; total: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new CatalogueUnavailableError();
  }
  const { data, error } = await supabase
    .from("products")
    .select(`${productColumns},categories(slug,name)`)
    .eq("status", "active")
    .order("name", { ascending: true });
  if (error || !data) {
    throw new CatalogueUnavailableError();
  }
  const all = (data as unknown as ProductRow[]).map(toProductSummary);
  // Attach each product's primary image (one extra read; images are few).
  const ids = all.map((p) => p.id);
  if (ids.length > 0) {
    const { data: images, error: imagesError } = await supabase
      .from("product_images")
      .select("product_id,storage_path,is_primary,sort_order")
      .in("product_id", ids)
      .order("sort_order", { ascending: true });
    if (imagesError) {
      throw new CatalogueUnavailableError();
    }
    const byProduct = new Map<string, string>();
    for (const img of images ?? []) {
      const row = img as {
        product_id: string;
        storage_path: string;
        is_primary: boolean;
      };
      // Prefer the is_primary row; otherwise keep the first (lowest sort_order).
      if (row.is_primary || !byProduct.has(row.product_id)) {
        byProduct.set(row.product_id, row.storage_path);
      }
    }
    for (const p of all) {
      p.primary_image = byProduct.get(p.id) ?? null;
    }
  }
  const filtered = sortProducts(applyListingFilters(all, params), params.sort);
  return { products: filtered, total: all.length };
}

export async function getProductBySlug(
  slug: string,
): Promise<ProductDetail | null> {
  // Invalid slug -> no query at all; the caller renders the 404 page.
  if (!isValidSlug(slug)) {
    return null;
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new CatalogueUnavailableError();
  }
  const { data, error } = await supabase
    .from("products")
    .select(`${productColumns},categories(slug,name)`)
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw new CatalogueUnavailableError();
  }
  if (!data) {
    return null;
  }
  const product = toProductSummary(data as unknown as ProductRow);
  const productId = product.id;

  const [variantsRes, imagesRes, measurementsRes] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id,colour,price_bdt,stock_quantity,sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_images")
      .select("id,storage_path,alt_text,sort_order,is_primary")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_measurements")
      .select(
        "lens_width_mm,bridge_mm,temple_mm,frame_width_mm,lens_height_mm,face_shape_ratings",
      )
      .eq("product_id", productId)
      .maybeSingle(),
  ]);
  if (variantsRes.error || imagesRes.error || measurementsRes.error) {
    throw new CatalogueUnavailableError();
  }

  return {
    ...product,
    variants: (variantsRes.data ?? []) as ProductVariant[],
    images: (imagesRes.data ?? []) as ProductImage[],
    measurements: (measurementsRes.data ?? null) as ProductMeasurements | null,
  };
}

/** Face-shape rating value ("excellent"/"good"/"fair") -> display chip label. */
export function faceShapeChipLabel(rating: string): string {
  switch (rating.toLowerCase()) {
    case "excellent":
      return "Best fit";
    case "good":
      return "Good fit";
    case "fair":
      return "Fair fit";
    default:
      return rating;
  }
}
