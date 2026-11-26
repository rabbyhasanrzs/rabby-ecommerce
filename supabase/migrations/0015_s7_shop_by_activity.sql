-- ==========================================================================
-- 0015 — S-7 Shop by Activity (F17, 1.x-6): activities column
-- ==========================================================================
-- Run this in the Supabase SQL Editor on TEST first, then on PRODUCTION
-- — the same pattern as migrations 0001/0003/0004/0005/0006/0007/0008/
-- 0009/0010/0011/0012/0013/0014. Do NOT claim this migration has been
-- run until the owner has run it on a project and the verification
-- queries below have been checked. Re-run safe (ADD COLUMN IF NOT
-- EXISTS, DROP CONSTRAINT IF EXISTS + conditional ADD).
--
-- Shop by Activity is 1.x-6 in the approved docs (F17:
-- "browse by use (driving, sport, beach, everyday)", "Activity tags
-- per product"). There is no activity data anywhere today — no column,
-- no tag, no route, no filter — so this migration creates the data
-- first; the storefront cannot be built before it exists. See the
-- S-7 Shop by Activity investigation note
-- (~/workspace/your_files/s-7-shop-by-activity-investigation.md).
--
-- What this does:
--   1. ADD COLUMN activities text[] on products (default '{}', NOT
--      NULL) — a product can suit several activities (Aviator ->
--      driving + everyday), which a single column could not express.
--   2. CHECK products_activities_check — every tagged activity must
--      be one of the 4 approved slugs. The list is fixed here and in
--      lib/activities.ts; changing it needs a migration, not a quiet
--      code edit.
--   3. NO backfill — the owner tags each product by hand in the admin
--      product form after the merge. Tags on demo products are DEMO
--      tags, to be replaced when real products arrive. No invented
--      mapping is ever written by a migration.
--
-- What this does NOT do: no new table, no RLS change (table-level
-- grants already cover the new column — anon SELECT and
-- authenticated write on products are unchanged), no seed rows, no
-- change to categories (activities stay a separate axis), no
-- dedicated route (the storefront uses ?activity= like ?category=).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. activities column — re-run safe.
-- --------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS activities text[] NOT NULL DEFAULT '{}';

-- --------------------------------------------------------------------------
-- 2. CHECK — every tagged activity is one of the 4 approved slugs.
--    Re-run safe: DROP ... IF EXISTS, then ADD only when missing.
--    An empty array '{}' passes (it is a subset of the 4 slugs).
-- --------------------------------------------------------------------------

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_activities_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_activities_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_activities_check
      CHECK (activities <@ ARRAY['driving', 'sport', 'beach', 'everyday']::text[]);
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 3. Verification (run after applying; all on the project where the
--    migration ran — TEST first, then PRODUCTION)
--    * The column exists with the right default:
--      SELECT column_name, data_type, column_default, is_nullable
--        FROM information_schema.columns
--       WHERE table_name = 'products' AND column_name = 'activities';
--      -- activities | ARRAY | '{}'::text[] | NO
--    * The CHECK lists the 4 slugs:
--      SELECT pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conname = 'products_activities_check';
--      -- CHECK (activities <@ ARRAY['driving', 'sport', 'beach',
--      --   'everyday']::text[])
--    * Existing products are untagged (no invented backfill):
--      SELECT count(*) FROM public.products
--       WHERE activities <> '{}';
--      -- 0
--    * An unknown slug is rejected:
--      UPDATE public.products SET activities = ARRAY['golf']
--       WHERE slug = 'sample-round-a';
--      -- ERROR: new row violates check constraint
--      --   "products_activities_check"
-- --------------------------------------------------------------------------
