-- ==========================================================================
-- 0010 — S-7 product reviews (T-70, second 1.x feature)
-- ==========================================================================
-- Run this in the Supabase SQL Editor on TEST first, then on PRODUCTION
-- — the same pattern as migrations 0001/0003/0004/0005/0006/0007/0008/0009.
-- Do NOT claim this migration has been run until the owner has run it
-- on a project and the verification queries below have been checked.
-- Re-run safe (CREATE TABLE IF NOT EXISTS, DROP POLICY / DROP FUNCTION
-- IF EXISTS, CREATE OR REPLACE).
--
-- What this does:
--   1. reviews table — one row per (order, product) review, enforced
--      by UNIQUE (order_id, product_id). Fields: reviewer_name (from
--      the order — never free text), rating 1–5 (required), optional
--      Quality / Value / Fit sub-ratings 1–5 (the F12 display set),
--      body text 1–2000 chars (required), status
--      pending/approved/rejected (default pending — admin approves
--      before publish). NO seed rows: no invented reviews, ever
--      (design-direction D-8). is_demo defaults false.
--   2. RLS: admin-only policy (discount_codes pattern, migration
--      0005) — NO anon policy, NO anon grant. The storefront never
--      selects this table directly; public reads and the submit path
--      go through the SECURITY DEFINER functions below. Admin
--      reads/writes go through the admin client (RLS
--      reviews_admin_all + the table-level grant in §3).
--   3. GRANT SELECT, INSERT, UPDATE, DELETE ON reviews TO
--      authenticated (0007-style — the admin panel's approve/reject
--      writes need the table-level privilege as well as the policy).
--   4. get_product_reviews(p_slug) — SECURITY DEFINER read path:
--      approved reviews + aggregate (average, count, 5→1 breakdown,
--      Quality/Value/Fit averages) in one call. Returns the 50 most
--      recent approved reviews; the counts cover ALL approved
--      reviews. Never returns phone, email, order reference, or
--      pending/rejected rows.
--   5. get_product_review_aggregates(p_slugs) — SECURITY DEFINER
--      batch read for listing cards: one row per slug (count +
--      average, approved only), so /sunglasses never does N+1.
--   6. submit_review(...) — SECURITY DEFINER submit path. In order:
--      rating/body shape checks; order lookup by reference + phone
--      (one shared 'review_order_not_found' error for "no such
--      order" and "phone does not match", so references cannot be
--      enumerated); order must be 'delivered'; the product must
--      exist and be in that order (order_items snapshot); one review
--      per order+product (pre-check + unique_violation backstop).
--      The reviewer name comes from the order's customer_name.
--      Inserts as 'pending' — nothing publishes without an admin.
--
-- What this does NOT do: no change to orders / order_items /
-- lookup_guest_order (read-only reuse — no signature change); no
-- change to auth, proxy.ts, demo config values, or payment code;
-- no email invite (F18 notifications is a separate 1.x feature);
-- no review-reporting control (later addition if abuse appears).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. reviews table
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_reference  text NOT NULL,
  reviewer_name    text NOT NULL CHECK (char_length(btrim(reviewer_name)) >= 1),
  rating           int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  quality_rating   int CHECK (quality_rating BETWEEN 1 AND 5),
  value_rating     int CHECK (value_rating BETWEEN 1 AND 5),
  fit_rating       int CHECK (fit_rating BETWEEN 1 AND 5),
  body             text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  is_demo          bool NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_one_per_order_product UNIQUE (order_id, product_id)
);

-- --------------------------------------------------------------------------
-- 2. RLS — admin-only (discount_codes pattern, migration 0005)
-- --------------------------------------------------------------------------

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_admin_all ON public.reviews;
CREATE POLICY reviews_admin_all ON public.reviews
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------------
-- 3. Table-level grants for the admin client (0007-style)
-- --------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;

-- --------------------------------------------------------------------------
-- 4. get_product_reviews — approved reviews + aggregate, one call
--    SECURITY DEFINER (reviews has no anon policy) with search_path
--    fixed to public, same style as validate_discount_code (0009).
--    Callable by anon + authenticated: the PDP calls it with the
--    anon client. The average is display-only, one decimal, computed
--    here — never stored on products (it would drift from the table).
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_product_reviews(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := btrim(COALESCE(p_slug, ''));
  v_product_id uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_product_id
    FROM public.products
   WHERE slug = v_slug AND status = 'active';

  IF v_product_id IS NULL THEN
    RETURN jsonb_build_object(
      'product_slug', v_slug,
      'review_count', 0,
      'average_rating', NULL,
      'breakdown', jsonb_build_object('5', 0, '4', 0, '3', 0, '2', 0, '1', 0),
      'quality_average', NULL,
      'value_average', NULL,
      'fit_average', NULL,
      'reviews', '[]'::jsonb
    );
  END IF;

  WITH approved AS (
    SELECT * FROM public.reviews
     WHERE product_id = v_product_id AND status = 'approved'
  )
  SELECT jsonb_build_object(
    'product_slug', v_slug,
    'review_count', (SELECT COUNT(*) FROM approved),
    'average_rating', (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE round(avg(rating)::numeric, 1) END FROM approved),
    'breakdown', jsonb_build_object(
      '5', (SELECT COUNT(*) FROM approved WHERE rating = 5),
      '4', (SELECT COUNT(*) FROM approved WHERE rating = 4),
      '3', (SELECT COUNT(*) FROM approved WHERE rating = 3),
      '2', (SELECT COUNT(*) FROM approved WHERE rating = 2),
      '1', (SELECT COUNT(*) FROM approved WHERE rating = 1)
    ),
    'quality_average', (SELECT CASE WHEN COUNT(quality_rating) = 0 THEN NULL ELSE round(avg(quality_rating)::numeric, 1) END FROM approved),
    'value_average', (SELECT CASE WHEN COUNT(value_rating) = 0 THEN NULL ELSE round(avg(value_rating)::numeric, 1) END FROM approved),
    'fit_average', (SELECT CASE WHEN COUNT(fit_rating) = 0 THEN NULL ELSE round(avg(fit_rating)::numeric, 1) END FROM approved),
    'reviews', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT reviewer_name, rating, quality_rating, value_rating,
               fit_rating, body, created_at
          FROM approved ORDER BY created_at DESC LIMIT 50
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_reviews(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_reviews(text) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 5. get_product_review_aggregates — batch aggregates for listing cards
--    One row per slug (count + average, approved only). The listing
--    page calls this once per load instead of once per card (N+1).
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_product_review_aggregates(p_slugs text[])
RETURNS TABLE (product_slug text, review_count int, average_rating numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.slug,
         COUNT(r.id)::int,
         CASE WHEN COUNT(r.id) = 0 THEN NULL ELSE round(avg(r.rating)::numeric, 1) END
    FROM public.products p
    LEFT JOIN public.reviews r
      ON r.product_id = p.id AND r.status = 'approved'
   WHERE p.slug = ANY (p_slugs)
     AND p.status = 'active'
   GROUP BY p.slug;
$$;

REVOKE ALL ON FUNCTION public.get_product_review_aggregates(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_review_aggregates(text[]) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 6. submit_review — verified-buyer submit path
--    SECURITY DEFINER (reviews has no anon policy) with search_path
--    fixed to public. Callable by anon + authenticated: the submit
--    endpoint calls it with the anon client.
--    Behaviour, in order:
--      bad rating / sub-rating / body -> 'invalid_rating' /
--        'invalid_body' (the API schema rejects these first; the
--        function is the backstop, never trusting the client)
--      no such order OR phone does not match -> ONE error
--        'review_order_not_found' (no reference enumeration)
--      order not delivered -> 'review_order_not_delivered'
--      product missing / inactive -> 'review_product_not_found'
--      product not in this order -> 'review_product_not_in_order'
--      review already exists for this order+product ->
--        'review_already_submitted' (pre-check + unique_violation)
--      otherwise -> insert as 'pending' (admin approves before
--        publish) with the reviewer name from the order.
--    The phone is compared server-side and never returned, logged,
--    or stored on the review row.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_review(
  p_reference text,
  p_phone text,
  p_product_slug text,
  p_rating int,
  p_quality_rating int,
  p_value_rating int,
  p_fit_rating int,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_order public.orders%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_review_id uuid;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;
  IF p_quality_rating IS NOT NULL AND (p_quality_rating < 1 OR p_quality_rating > 5) THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;
  IF p_value_rating IS NOT NULL AND (p_value_rating < 1 OR p_value_rating > 5) THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;
  IF p_fit_rating IS NOT NULL AND (p_fit_rating < 1 OR p_fit_rating > 5) THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;
  IF btrim(COALESCE(p_body, '')) = '' OR char_length(btrim(p_body)) > 2000 THEN
    RAISE EXCEPTION 'invalid_body';
  END IF;

  v_phone := public.normalize_bd_phone(p_phone);

  SELECT * INTO v_order
    FROM public.orders
   WHERE reference = btrim(COALESCE(p_reference, ''));
  IF NOT FOUND OR v_order.customer_phone <> v_phone THEN
    RAISE EXCEPTION 'review_order_not_found';
  END IF;

  IF v_order.status <> 'delivered' THEN
    RAISE EXCEPTION 'review_order_not_delivered';
  END IF;

  SELECT * INTO v_product
    FROM public.products
   WHERE slug = btrim(COALESCE(p_product_slug, '')) AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_product_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.order_items
     WHERE order_id = v_order.id AND product_slug = v_product.slug
  ) THEN
    RAISE EXCEPTION 'review_product_not_in_order';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reviews
     WHERE order_id = v_order.id AND product_id = v_product.id
  ) THEN
    RAISE EXCEPTION 'review_already_submitted';
  END IF;

  INSERT INTO public.reviews (
    product_id, order_id, order_reference, reviewer_name,
    rating, quality_rating, value_rating, fit_rating, body, status
  ) VALUES (
    v_product.id, v_order.id, v_order.reference, v_order.customer_name,
    p_rating, p_quality_rating, p_value_rating, p_fit_rating, btrim(p_body), 'pending'
  ) RETURNING id INTO v_review_id;

  RETURN jsonb_build_object('review_id', v_review_id, 'status', 'pending');
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'review_already_submitted';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review(text, text, text, int, int, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review(text, text, text, int, int, int, int, text) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 7. Verification (run after applying; all on the project where the
--    migration ran — TEST first, then PRODUCTION)
--    * SELECT count(*) FROM public.reviews;  -- 0 (no seed rows, ever)
--    * SELECT * FROM public.get_product_reviews('sample-round-a');
--      -- review_count 0, average_rating null, reviews []
--    * SELECT * FROM public.get_product_review_aggregates(
--        ARRAY['sample-round-a', 'sample-aviator-a']);
--      -- one row per slug, review_count 0, average_rating null
--    * Anon SELECT on reviews must be denied (RLS, no anon policy):
--      -- as anon: SELECT * FROM public.reviews;  -- 0 rows / denied
--    * submit_review with a bad reference raises
--      'review_order_not_found' (same for a wrong phone).
-- --------------------------------------------------------------------------
