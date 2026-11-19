-- ============================================================================
-- Rabby e-commerce — S-1 catalogue migration
-- File: supabase/migrations/0001_s1_catalogue.sql
-- Project: rabby-ecommerce-test (Supabase, Singapore, Free)
-- Date: 2026-11-18
--
-- HOW TO APPLY (owner / browser session):
--   Supabase Dashboard -> project rabby-ecommerce-test -> SQL Editor
--   -> New query -> paste this WHOLE file -> Run.
--   It is safe to re-run: tables use IF NOT EXISTS, policies are dropped
--   and re-created, seed rows use ON CONFLICT DO NOTHING.
--
-- SCOPE: S-1 ONLY — categories, products, product_variants, product_images,
-- product_measurements. Do NOT create orders / customers / order_items /
-- admin_users / order_status_history / payment_config / delivery_config /
-- discount_config / site_settings here — those land in S-2–S-4.
--
-- SECURITY (audit §5, G-C1 — RLS FIRST, before any seed data):
--   * RLS is enabled on EVERY table at creation, deny-by-default.
--   * anon + authenticated may SELECT only, and only public rows:
--       categories: is_active = true
--       products:   status = 'active'
--       variants / images / measurements: only via an active product
--         (enforced by joining products and checking status = 'active').
--   * NO INSERT / UPDATE / DELETE policy exists for anon or authenticated
--     on ANY table — writes are denied by default. Admin policies are
--     deliberately NOT created here: there is no admin role flag yet
--     (Supabase Auth + role flag land in S-4, audit G-H1). Until then,
--     writes happen only from the Dashboard as postgres / service_role.
--   * GRANTs below give anon/authenticated SELECT only — no write grants.
--   * The anon key is public by design; RLS (not key secrecy) is the
--     protection. Never put the service_role key in NEXT_PUBLIC_*.
--
-- MONEY: integer BDT only (price_bdt int, never float/double).
-- DEMO DATA: every seeded row is is_demo = true, status = 'active'.
--   Prices are the approved DEMO prices (Entry 850–1,100 / Mid 1,450–1,900 /
--   Premium 2,400–3,200). They are NOT final prices.
-- ============================================================================

-- gen_random_uuid() is built into Postgres 13+ (Supabase); no extension
-- is needed.

-- --------------------------------------------------------------------------
-- 1. TABLES
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  category_id uuid REFERENCES public.categories (id),
  price_bdt   int NOT NULL CHECK (price_bdt > 0),
  stock_total int NOT NULL DEFAULT 0 CHECK (stock_total >= 0),
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  colour         text NOT NULL,
  price_bdt      int, -- NULL = use the product's price_bdt (no per-variant price in demo data)
  stock_quantity int, -- NULL = per-variant stock NOT tracked in demo data (see note below)
  sort_order     int NOT NULL DEFAULT 0,
  UNIQUE (product_id, colour)
);

-- NOTE (variant stock decision, S-1): the demo catalogue tracks stock only
-- at product level (products.stock_total). product_variants.stock_quantity
-- is therefore left NULL for every seeded variant. Do NOT invent a
-- per-variant split of stock_total (e.g. dividing 12 across Black/Brown) —
-- that would fabricate stock figures. Per-variant stock tracking is a
-- real-site decision for a later phase; until then the storefront must
-- treat a variant as available iff its product has stock_total > 0 and
-- status = 'active'.

CREATE TABLE IF NOT EXISTS public.product_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  alt_text     text,
  sort_order   int NOT NULL DEFAULT 0,
  is_primary   boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.product_measurements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL UNIQUE REFERENCES public.products (id) ON DELETE CASCADE,
  lens_width_mm       int,
  bridge_mm           int,
  temple_mm           int,
  frame_width_mm      int,
  lens_height_mm      int,
  face_shape_ratings  jsonb
);

-- Helpful read indexes (idempotent).
CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_status
  ON public.products (status);
CREATE INDEX IF NOT EXISTS idx_variants_product_id
  ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_images_product_id
  ON public.product_images (product_id);

-- Keep products.updated_at fresh on UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY — deny-by-default (audit §5)
--    Enable RLS on every table FIRST, then add the anon/authenticated
--    SELECT-only policies. No write policies exist anywhere in S-1.
-- --------------------------------------------------------------------------

ALTER TABLE public.categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_measurements  ENABLE ROW LEVEL SECURITY;

-- Grants: SELECT only for the two PostgREST roles. No INSERT/UPDATE/
-- DELETE grant is given to anon or authenticated on any table.
GRANT SELECT ON public.categories, public.products, public.product_variants,
  public.product_images, public.product_measurements
  TO anon, authenticated;

-- Categories: public rows only.
DROP POLICY IF EXISTS categories_select_active ON public.categories;
CREATE POLICY categories_select_active ON public.categories
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Products: active products only. (is_demo rows are public demo data;
-- the storefront must still label them DEMO. Real products later use
-- is_demo = false.)
DROP POLICY IF EXISTS products_select_active ON public.products;
CREATE POLICY products_select_active ON public.products
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

-- Variants: only for active products. The EXISTS join is what stops an
-- inactive product's variants leaking through a direct variants query.
DROP POLICY IF EXISTS variants_select_active_product ON public.product_variants;
CREATE POLICY variants_select_active_product ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND p.status = 'active'
    )
  );

-- Images: only for active products (same join guard as variants).
DROP POLICY IF EXISTS images_select_active_product ON public.product_images;
CREATE POLICY images_select_active_product ON public.product_images
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.status = 'active'
    )
  );

-- Measurements: only for active products (same join guard as variants).
DROP POLICY IF EXISTS measurements_select_active_product ON public.product_measurements;
CREATE POLICY measurements_select_active_product ON public.product_measurements
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_measurements.product_id
        AND p.status = 'active'
    )
  );

-- --------------------------------------------------------------------------
-- 3. SEED — demo catalogue (source of truth:
--    ~/workspace/your_files/demo-catalog-template.csv, 8 rows)
--    All rows is_demo = true, status = 'active'. Idempotent via
--    ON CONFLICT DO NOTHING (re-running changes nothing).
--
--    Categories use FIXED UUIDs so the seed FKs below are stable across
--    re-runs. Products use gen_random_uuid() and are referenced below by
--    slug subquery, so re-runs resolve to the already-inserted row.
-- --------------------------------------------------------------------------

INSERT INTO public.categories (id, slug, name, sort_order, is_active)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'women',     'Women',     1, true),
  ('10000000-0000-4000-8000-000000000002', 'men',       'Men',       2, true),
  ('10000000-0000-4000-8000-000000000003', 'polarized', 'Polarized', 3, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products
  (slug, name, description, category_id, price_bdt, stock_total, status, is_demo)
VALUES
  ('sample-round-a',
   'SAMPLE Round A',
   'Sample product for testing only. Not a real Rabby product.',
   '10000000-0000-4000-8000-000000000001', 950, 12, 'active', true),
  ('sample-aviator-a',
   'SAMPLE Aviator A',
   'Sample product for testing only. Not a real Rabby product.',
   '10000000-0000-4000-8000-000000000002', 1450, 8, 'active', true),
  ('sample-square-gold-a',
   'SAMPLE Square Gold A',
   'Sample product for testing only. Not a real Rabby product.',
   '10000000-0000-4000-8000-000000000002', 2400, 5, 'active', true),
  ('sample-hexagon-a',
   'SAMPLE Hexagon A',
   'Sample product for testing only. Not a real Rabby product.',
   '10000000-0000-4000-8000-000000000001', 1100, 2, 'active', true),
  ('sample-blue-tint-a',
   'SAMPLE Blue Tint A',
   'Sample product for testing only. Not a real Rabby product.',
   '10000000-0000-4000-8000-000000000003', 1750, 15, 'active', true),
  ('sample-futuristic-a',
   'SAMPLE Futuristic A',
   'Sample product for testing only. Not a real Rabby product.',
   '10000000-0000-4000-8000-000000000002', 3200, 0, 'active', true),
  ('sample-red-lens-a',
   'SAMPLE Red Lens A',
   'Sample product for testing only. Not a real Rabby product.',
   '10000000-0000-4000-8000-000000000001', 850, 18, 'active', true),
  ('sample-tortoise-a',
   'SAMPLE Tortoise A',
   'Sample product for testing only. Not a real Rabby product.',
   '10000000-0000-4000-8000-000000000003', 1900, 7, 'active', true)
ON CONFLICT (slug) DO NOTHING;

-- Variants: one row per colour in the CSV colours column.
-- price_bdt and stock_quantity are NULL by design (see the variant-stock
-- note above) — NULL price = use product price; NULL stock = not tracked
-- per variant in demo data.
INSERT INTO public.product_variants (product_id, colour, price_bdt, stock_quantity, sort_order)
SELECT p.id, v.colour, NULL, NULL, v.ord
FROM public.products p
JOIN (VALUES
  ('sample-round-a',        'Black',    1),
  ('sample-round-a',        'Brown',    2),
  ('sample-aviator-a',      'Gold',     1),
  ('sample-aviator-a',      'Black',    2),
  ('sample-square-gold-a',  'Gold',     1),
  ('sample-square-gold-a',  'Black',    2),
  ('sample-hexagon-a',      'Gold',     1),
  ('sample-hexagon-a',      'Blue',     2),
  ('sample-blue-tint-a',    'Blue',     1),
  ('sample-blue-tint-a',    'Black',    2),
  ('sample-futuristic-a',   'Black',    1),
  ('sample-futuristic-a',   'Silver',   2),
  ('sample-red-lens-a',     'Red',      1),
  ('sample-red-lens-a',     'Black',    2),
  ('sample-tortoise-a',     'Tortoise', 1),
  ('sample-tortoise-a',     'Brown',    2)
) AS v (slug, colour, ord) ON v.slug = p.slug
ON CONFLICT (product_id, colour) DO NOTHING;

-- Images: one primary row per product.
-- storage_path is '/images/<photo_file>' — the PHOTO ROUTE for these files
-- is decided in the S-1 handoff (recommended: web-UI upload to the repo at
-- public/images/, so the path below works as-is). If Supabase Storage is
-- chosen instead, these storage_path values must be updated to the bucket
-- public URLs. Photos themselves are NOT in this migration (binaries
-- cannot travel in SQL); provenance: demo-asset-sources.md (Pexels).
-- Re-run safe via the NOT EXISTS guard (product_images has no unique
-- constraint on (product_id, storage_path), so ON CONFLICT cannot guard it).
INSERT INTO public.product_images (product_id, storage_path, alt_text, sort_order, is_primary)
SELECT p.id, '/images/' || p.slug ||
  CASE WHEN p.slug = 'sample-square-gold-a' THEN '.jpg' ELSE '.webp' END,
  p.name, 1, true
FROM public.products p
WHERE p.slug IN (
  'sample-round-a', 'sample-aviator-a', 'sample-square-gold-a',
  'sample-hexagon-a', 'sample-blue-tint-a', 'sample-futuristic-a',
  'sample-red-lens-a', 'sample-tortoise-a'
)
AND NOT EXISTS (
  SELECT 1 FROM public.product_images pi WHERE pi.product_id = p.id
);

-- Measurements + face-shape ratings from the CSV mm / ratings columns.
-- NOTE (lens height): lens_height_mm is NOT in the CSV. The values below
-- are DEMO values only (same numbers as the prototype's measurement
-- diagram): Round 44, Aviator 45, Square Gold 44, Hexagon 42,
-- Blue Tint 45, Futuristic 40, Red Lens 43, Tortoise 41. They sit inside
-- the published adult lens-height range; real products must use their
-- real measured height. face_shape_ratings converts the CSV
-- "Round:fair;Square:excellent;..." strings to JSON objects.
INSERT INTO public.product_measurements
  (product_id, lens_width_mm, bridge_mm, temple_mm, frame_width_mm,
   lens_height_mm, face_shape_ratings)
SELECT p.id, m.lens_width_mm, m.bridge_mm, m.temple_mm, m.frame_width_mm,
       m.lens_height_mm, m.face_shape_ratings::jsonb
FROM public.products p
JOIN (VALUES
  ('sample-round-a',        50, 18, 140, 126, 44,
   '{"Round":"fair","Square":"excellent","Oval":"excellent","Heart":"good"}'),
  ('sample-aviator-a',      58, 14, 140, 138, 45,
   '{"Round":"good","Square":"excellent","Oval":"excellent","Heart":"excellent"}'),
  ('sample-square-gold-a',  55, 18, 145, 136, 44,
   '{"Round":"excellent","Square":"fair","Oval":"excellent","Heart":"good"}'),
  ('sample-hexagon-a',      52, 18, 140, 130, 42,
   '{"Round":"excellent","Square":"fair","Oval":"excellent","Heart":"good"}'),
  ('sample-blue-tint-a',    54, 17, 142, 133, 45,
   '{"Round":"excellent","Square":"fair","Oval":"excellent","Heart":"good"}'),
  ('sample-futuristic-a',   57, 16, 145, 138, 40,
   '{"Round":"excellent","Square":"fair","Oval":"good","Heart":"fair"}'),
  ('sample-red-lens-a',     53, 18, 140, 132, 43,
   '{"Round":"excellent","Square":"fair","Oval":"excellent","Heart":"good"}'),
  ('sample-tortoise-a',     52, 19, 142, 131, 41,
   '{"Round":"fair","Square":"excellent","Oval":"excellent","Heart":"good"}')
) AS m (slug, lens_width_mm, bridge_mm, temple_mm, frame_width_mm,
         lens_height_mm, face_shape_ratings)
  ON m.slug = p.slug
ON CONFLICT (product_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 4. VERIFICATION (read-only; the dashboard shows the result grid)
--    Expected after a successful run:
--      categories 3 | products 8 | variants 16 | images 8 | measurements 8
-- --------------------------------------------------------------------------
SELECT 'categories' AS table_name, count(*) AS rows FROM public.categories
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'product_variants', count(*) FROM public.product_variants
UNION ALL SELECT 'product_images', count(*) FROM public.product_images
UNION ALL SELECT 'product_measurements', count(*) FROM public.product_measurements;
