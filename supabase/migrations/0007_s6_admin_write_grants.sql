-- ==========================================================================
-- 0007 — S-6 inventory save fix (Postgres 42501 on production)
-- ==========================================================================
-- Run this in the Supabase SQL Editor BEFORE merging PR "S-6: Inventory
-- save grants the admin write privileges" — the same pattern as
-- migrations 0001/0003/0004/0005/0006.
-- Re-run safe (GRANT is idempotent).
--
-- What happened: the production inventory save failed with Postgres
-- error 42501 "permission denied for table products" (Vercel log,
-- 2026-11-22 23:55-23:59 +06 — the route logs the real error since
-- PR #26). Migration 0001 granted SELECT only on the catalogue tables,
-- and migration 0005 added the admin RLS policies (products_admin_all
-- etc.) but never the table-level write privileges. Postgres needs
-- BOTH: the GRANT decides whether the role may touch the table at all,
-- the RLS policy decides which rows. With no GRANT, every direct admin
-- write (inventory save, product create/edit, category save, settings
-- save, discount add/toggle) fails with 42501 before RLS is even
-- consulted. Guest checkout is unaffected — it writes through the
-- SECURITY DEFINER functions, never through direct table writes.
--
-- Why only production failed: the test project already carries these
-- grants (verified by a direct anon REST probe returning 200 [] and by
-- the owner's own test writes — product "rabby", RE518, tax 10% — all
-- persisting). The mechanism of that drift is not recorded; this
-- migration re-asserts the grants on BOTH projects so they match.
-- (Same drift lesson as 0006 section 3 for the EXECUTE grants.)
--
-- What this does NOT do: it grants nothing to the anonymous role
-- (guest reads stay SELECT-only via the 0001 grants) and nothing on
-- orders, order_items, order_status_events, payments, server_secrets
-- or admins — those tables stay writable only through SECURITY
-- DEFINER functions or not at all. The RLS policies remain the real
-- gate: the admin policies check is_admin(), so a non-admin
-- authenticated user still sees 0 rows (verified by the RLS test,
-- Section 6).
-- ==========================================================================

-- Admin-written tables: catalogue + settings + discount codes.
-- (SELECT was already granted in 0001/0005; re-granting it here is
-- harmless and keeps the privilege set readable in one place.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_codes TO authenticated;
