-- ==========================================================================
-- 0011 — S-7 home-page reviews section (customer reviews on the home page)
-- ==========================================================================
-- Run this in the Supabase SQL Editor on TEST first, then on PRODUCTION
-- — the same pattern as migrations 0001/0003/0004/0005/0006/0007/0008/0009/0010.
-- Do NOT claim this migration has been run until the owner has run it
-- on a project and the verification queries below have been checked.
-- Re-run safe (CREATE OR REPLACE, DROP FUNCTION IF EXISTS for arity
-- changes — none here; this migration adds one function only).
--
-- What this does:
--   1. get_recent_approved_reviews(p_limit) — SECURITY DEFINER read
--      path for the home page: the most recent APPROVED reviews
--      across all products, newest first, with the product slug +
--      name for the PDP link. One call, no N+1. The limit is
--      clamped server-side to 1..10 (the home page asks for 3).
--      Only reviews of ACTIVE products are returned. Never returns
--      phone, email, order reference, or pending/rejected rows —
--      only reviewer name (from the order), rating, body, and date.
--
-- What this does NOT do: no new table (the reviews table from 0010
-- is reused as-is); no change to the reviews RLS (admin-only, no
-- anon policy — the storefront never selects the table directly);
-- no change to get_product_reviews / submit_review (0010); no
-- change to auth, proxy.ts, demo config values, or payment code;
-- no seed rows: no invented reviews, ever (design-direction D-8).
-- The home section stays hidden until the first approved review
-- exists — this function returning zero rows is the normal state.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. get_recent_approved_reviews — recent approved reviews, any product
--    SECURITY DEFINER (reviews has no anon policy) with search_path
--    fixed to public, same style as get_product_reviews (0010).
--    Callable by anon + authenticated: the home page calls it with
--    the anon client.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_recent_approved_reviews(p_limit int)
RETURNS TABLE (
  product_slug text,
  product_name text,
  reviewer_name text,
  rating int,
  body text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.slug, p.name, r.reviewer_name, r.rating, r.body, r.created_at
    FROM public.reviews r
    JOIN public.products p ON p.id = r.product_id
   WHERE r.status = 'approved'
     AND p.status = 'active'
   ORDER BY r.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 3), 1), 10);
$$;

REVOKE ALL ON FUNCTION public.get_recent_approved_reviews(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_approved_reviews(int) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 2. Verification (run after applying; all on the project where the
--    migration ran — TEST first, then PRODUCTION)
--    * SELECT * FROM public.get_recent_approved_reviews(3);
--      -- 0 rows until the first review is approved (the honest
--      -- empty state); after approval, the newest approved review
--      -- first, with its product slug + name.
--    * SELECT * FROM public.get_recent_approved_reviews(100);
--      -- at most 10 rows (server-side clamp).
--    * Anon SELECT on reviews must still be denied (RLS, no anon
--      -- policy — unchanged from 0010):
--      -- as anon: SELECT * FROM public.reviews;  -- 0 rows / denied
-- --------------------------------------------------------------------------
