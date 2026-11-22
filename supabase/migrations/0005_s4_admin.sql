-- ============================================================================
-- Rabby e-commerce — S-4 admin migration
-- File: supabase/migrations/0005_s4_admin.sql
-- Project: rabby-ecommerce-test (Supabase, Singapore, Free)
-- Date: 2026-11-22
--
-- HOW TO APPLY (owner / browser session):
--   Supabase Dashboard -> project rabby-ecommerce-test -> SQL Editor
--   -> New query -> paste this WHOLE file -> Run.
--   It is safe to re-run: tables use IF NOT EXISTS, policies use
--   DROP POLICY IF EXISTS first, functions use CREATE OR REPLACE (the
--   create_guest_order update below keeps its 5-argument arity, so no
--   DROP is needed), the bucket insert uses ON CONFLICT DO NOTHING,
--   and the seed rows use ON CONFLICT DO NOTHING. The verification
--   counts in section 8 are 0 rows for admins / discount_codes on a
--   fresh database (the admin user is created by the owner AFTER this
--   runs), 1 row for site_settings, 1 row for discount_codes (DEMO10).
--
-- SCOPE: S-4 ONLY (admin auth + settings data layer, T-40 core +
-- T-48 data layer) — admins table + is_admin() / am_i_admin(),
-- site_settings (single row) + discount_codes, the product-images
-- Storage bucket + policies, admin-write RLS policies on the catalogue
-- tables, SECURITY DEFINER admin functions for orders / customers /
-- dashboard / analytics / status + payment updates, and the
-- create_guest_order update (settings-driven tax/delivery + disabled
-- payment-method rejection).
--
-- SECURITY (same rule as migrations 0003/0004 — RLS FIRST):
--   * admins: RLS enabled, NO policies. Direct reads are never needed
--     by the app; the role check runs only inside SECURITY DEFINER
--     functions (is_admin() / am_i_admin()).
--   * There are NO policies AT ALL on orders / order_items /
--     order_status_events / payments — the S-1–S-3 deny-by-default
--     discipline is unchanged. Admin reads/writes of those tables go
--     ONLY through the SECURITY DEFINER functions in section 6, each
--     of which checks is_admin() FIRST and returns
--     {"ok": false, "error": "forbidden"} to a non-admin — never data.
--   * mark_order_payment_status (migration 0004) is NOT touched: the
--     webhook route calls it with the anon client after HMAC
--     verification, and adding an is_admin() check inside it would
--     break the webhook. Admin payment updates use the NEW
--     admin_update_payment_status below.
--   * All SECURITY DEFINER functions fix search_path to public, and
--     EXECUTE is granted only to authenticated (PUBLIC is revoked
--     first). The anon key is public by design; RLS + SECURITY
--     DEFINER functions (not key secrecy) are the protection. Never
--     put the service_role key in NEXT_PUBLIC_* — this migration
--     needs no service_role key at all.
--   * site_settings is public shop config (tax %, delivery fees,
--     which payment methods are on) — NOT a secret — so it has an
--     anon SELECT policy. Writes are admin-only (is_admin() ALL).
--   * discount_codes has NO anon policy: admin reads/writes via the
--     admin client only. Coupon redemption by customers is 1.x, NOT
--     S-4, so no customer-facing read path exists yet.
--
-- STATUS VALUES: orders.status stores LOWERCASE database values
--   ('placed', 'confirmed', 'processing', 'packed', 'shipped',
--   'out_for_delivery', 'delivered', 'cancelled', 'failed',
--   'returned', 'refunded' — the CHECK constraint from migration
--   0003). The admin functions accept either the database value or
--   the display label ('Out for Delivery', 'Placed', ...) and
--   normalise it before storing, so the Admin UI can pass the labels
--   it shows. admin_list_orders filters the same way.
--
-- MONEY: integer BDT only (all *_bdt int, never float/double).
-- DEMO CONFIG: tax 5% + delivery Inside Dhaka ৳60 (1–2 days) /
--   Outside Dhaka ৳120 (3–5 days), discount code DEMO10 (10% off) —
--   the same numbers as lib/demo-config.ts, now seeded as the
--   site_settings / discount_codes rows so the owner can change them
--   from Admin (FR-16–FR-19). create_guest_order reads them from
--   site_settings and falls back to 5 / 60 / 120 when the row is
--   missing.
-- REVENUE RULE (analytics functions): revenue counts non-cancelled
--   orders only — orders with status Cancelled / Failed / Refunded
--   are excluded from revenue, order counts and best sellers. The
--   same exclusion applies to total_spent_bdt in
--   admin_list_customers.
-- ADMIN CANCEL NOTE: admin_update_order_status writes the event + the
--   status, and restores stock when the new status is 'cancelled' —
--   the same restore as the customer cancel path (cancel_guest_order,
--   migration 0003). Returns / refunds do NOT restore stock (the item
--   already left the shop).
-- TERMINAL STATUSES (deviation from the Slice A brief, which listed
--   Delivered as terminal): only Cancelled / Failed / Refunded are
--   terminal — an order cannot move out of those. Delivered is NOT
--   terminal: the approved 7-day return/exchange workflow needs
--   Delivered -> Returned -> Refunded, and Slice B's order-status
--   workflow (NEXT_STATUSES in app/admin/(protected)/admin-data.ts)
--   offers exactly those moves. Blocking them would make the Returns
--   flow unreachable.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ADMINS TABLE + is_admin() / am_i_admin()
--    First admin (owner step, in the checklist): create the admin user
--    in the Supabase Auth dashboard, then:
--      INSERT INTO public.admins (user_id, role)
--      VALUES ('<the new user's id>', 'owner');
--    No password is ever sent in chat or stored in the repo.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: the app never reads this table directly.

-- True iff the calling user is in public.admins. SECURITY DEFINER so
-- it can read the policy-less admins table; STABLE (read-only).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Thin wrapper the app calls from the browser/server admin client:
-- "am I an admin?" — same check, callable as an RPC.
CREATE OR REPLACE FUNCTION public.am_i_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.am_i_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.am_i_admin() TO authenticated;

-- --------------------------------------------------------------------------
-- 2. SITE SETTINGS (single row, id = 1) + DISCOUNT CODES
--    The seeded values are the DEMO CONFIG numbers (tax 5%, Inside
--    ৳60 / 1–2 days, Outside ৳120 / 3–5 days, all payment methods on,
--    empty notice/contacts) so nothing changes until the owner edits
--    them in Admin. The storefront reads this row (GET /api/settings);
--    create_guest_order (section 7) reads it for the server total.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.site_settings (
  id                         int PRIMARY KEY CHECK (id = 1),
  tax_rate_percent           int NOT NULL DEFAULT 5
                             CHECK (tax_rate_percent BETWEEN 0 AND 100),
  delivery_inside_fee_bdt    int NOT NULL DEFAULT 60,
  delivery_inside_estimate   text NOT NULL DEFAULT '1–2 days',
  delivery_outside_fee_bdt   int NOT NULL DEFAULT 120,
  delivery_outside_estimate  text NOT NULL DEFAULT '3–5 days',
  payment_cod_enabled        bool NOT NULL DEFAULT true,
  payment_bkash_enabled      bool NOT NULL DEFAULT true,
  payment_nagad_enabled      bool NOT NULL DEFAULT true,
  payment_rocket_enabled     bool NOT NULL DEFAULT true,
  payment_card_enabled       bool NOT NULL DEFAULT true,
  website_notice             text NOT NULL DEFAULT '',
  support_whatsapp           text NOT NULL DEFAULT '',
  support_messenger          text NOT NULL DEFAULT '',
  support_phone              text NOT NULL DEFAULT '',
  support_email              text NOT NULL DEFAULT '',
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_settings_select_public ON public.site_settings;
CREATE POLICY site_settings_select_public ON public.site_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS site_settings_admin_all ON public.site_settings;
CREATE POLICY site_settings_admin_all ON public.site_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed the single row (re-run safe: ON CONFLICT DO NOTHING keeps an
-- owner-edited row untouched on re-run).
INSERT INTO public.site_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.discount_codes (
  code        text PRIMARY KEY,
  percent_off int NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  active      bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- Admin-only: no anon policy. Admin reads/writes via the admin client;
-- customer redemption is 1.x, not S-4.
DROP POLICY IF EXISTS discount_codes_admin_all ON public.discount_codes;
CREATE POLICY discount_codes_admin_all ON public.discount_codes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DEMO10 pre-seeded (as in the prototype's Settings). Re-run safe.
INSERT INTO public.discount_codes (code, percent_off, active)
VALUES ('DEMO10', 10, true)
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------------------------
-- 3. STORAGE BUCKET — product-images (public read, admin write)
--    Product photos uploaded from Admin (T-42) live here; the S-1
--    public/images/ demo photos stay as they are.
-- --------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "product-images public read" ON storage.objects;
CREATE POLICY "product-images public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product-images admin insert" ON storage.objects;
CREATE POLICY "product-images admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "product-images admin update" ON storage.objects;
CREATE POLICY "product-images admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "product-images admin delete" ON storage.objects;
CREATE POLICY "product-images admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_admin());

-- --------------------------------------------------------------------------
-- 4. ADMIN-WRITE RLS POLICIES ON THE CATALOGUE TABLES
--    These ADD to the existing S-1 anon SELECT policies (which are
--    NOT dropped or altered): an admin (authenticated + is_admin())
--    can now INSERT / UPDATE / DELETE catalogue rows; everyone else
--    keeps read-only public access. No policy is added to orders /
--    order_items / order_status_events / payments — ever.
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS products_admin_all ON public.products;
CREATE POLICY products_admin_all ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS product_variants_admin_all ON public.product_variants;
CREATE POLICY product_variants_admin_all ON public.product_variants
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS product_images_admin_all ON public.product_images;
CREATE POLICY product_images_admin_all ON public.product_images
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS product_measurements_admin_all ON public.product_measurements;
CREATE POLICY product_measurements_admin_all ON public.product_measurements
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS categories_admin_all ON public.categories;
CREATE POLICY categories_admin_all ON public.categories
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------------
-- 5. SHARED HELPERS — status normalisation (see header note)
--    Accepts a database value ('out_for_delivery') or a display label
--    ('Out for Delivery') and returns the database value, or NULL
--    when the input is not a known status.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_order_status(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(replace(btrim(COALESCE(p_status, '')), ' ', '_'))
    WHEN 'placed' THEN 'placed'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'processing' THEN 'processing'
    WHEN 'packed' THEN 'packed'
    WHEN 'shipped' THEN 'shipped'
    WHEN 'out_for_delivery' THEN 'out_for_delivery'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'failed' THEN 'failed'
    WHEN 'returned' THEN 'returned'
    WHEN 'refunded' THEN 'refunded'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.normalize_order_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_order_status(text) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 6. ADMIN FUNCTIONS — SECURITY DEFINER, search_path fixed to public.
--    Every function checks is_admin() FIRST and returns
--    {"ok": false, "error": "forbidden"} when the caller is not an
--    admin. EXECUTE is granted only to authenticated (a logged-in
--    user); anon cannot call them at all. All reads of the
--    policy-less orders tables happen here, never from the client.
-- --------------------------------------------------------------------------

-- List orders, newest first, optionally filtered by status
-- (database value or display label — see normalize_order_status).
-- Returns a jsonb array of rows shaped like:
--   {id, reference, customer_name, customer_phone, customer_email,
--    address, zone, payment_method, payment_status, payment_reference,
--    total_bdt, status, created_at}
-- p_limit is clamped to 1..200 (default 50); p_offset >= 0.
CREATE OR REPLACE FUNCTION public.admin_list_orders(
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_limit int;
  v_offset int;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_status := public.normalize_order_status(p_status);
  IF p_status IS NOT NULL AND v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT o.id, o.reference, o.customer_name, o.customer_phone,
             o.customer_email, o.delivery_address AS address,
             o.delivery_zone AS zone, o.payment_method,
             o.payment_status, o.payment_reference,
             o.total_bdt, o.status, o.created_at
        FROM public.orders o
       WHERE v_status IS NULL OR o.status = v_status
       ORDER BY o.created_at DESC
       LIMIT v_limit OFFSET v_offset
    ) t
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_orders(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(text, int, int) TO authenticated;

-- One order in full: the order row, its items (snapshot names/prices),
-- its status timeline, and its payment row (method, status, reference,
-- sender). Returns {"ok": false, "error": "not_found"} when the
-- reference does not exist.
CREATE OR REPLACE FUNCTION public.admin_get_order(p_reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE reference = btrim(COALESCE(p_reference, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id,
      'reference', v_order.reference,
      'customer_name', v_order.customer_name,
      'customer_phone', v_order.customer_phone,
      'customer_email', v_order.customer_email,
      'address', v_order.delivery_address,
      'zone', v_order.delivery_zone,
      'payment_method', v_order.payment_method,
      'payment_status', v_order.payment_status,
      'payment_reference', v_order.payment_reference,
      'payment_sender', v_order.payment_sender,
      'subtotal_bdt', v_order.subtotal_bdt,
      'tax_bdt', v_order.tax_bdt,
      'delivery_fee_bdt', v_order.delivery_fee_bdt,
      'total_bdt', v_order.total_bdt,
      'status', v_order.status,
      'created_at', v_order.created_at,
      'updated_at', v_order.updated_at
    ),
    'items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'slug', product_slug,
        'name', product_name,
        'price_bdt', unit_price_bdt,
        'variant_colour', variant_colour,
        'quantity', quantity
      ) ORDER BY product_slug), '[]'::jsonb)
      FROM public.order_items
      WHERE order_id = v_order.id
    ),
    'status_events', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'status', to_status,
        'note', note,
        'created_at', created_at
      ) ORDER BY created_at ASC), '[]'::jsonb)
      FROM public.order_status_events
      WHERE order_id = v_order.id
    ),
    'payment', (
      SELECT jsonb_build_object(
        'method', method,
        'status', status,
        'reference', reference,
        'sender', sender_number
      )
      FROM public.payments
      WHERE order_id = v_order.id
      ORDER BY created_at DESC
      LIMIT 1
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_order(text) TO authenticated;

-- Customers, grouped by phone (guest checkout has no accounts —
-- T-45): one row per phone with the latest name/email, order count,
-- total spent (non-cancelled orders only, see header revenue rule)
-- and the last order time. Ordered by last order, newest first.
CREATE OR REPLACE FUNCTION public.admin_list_customers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT o.customer_phone AS phone,
             (ARRAY_AGG(o.customer_name ORDER BY o.created_at DESC))[1] AS name,
             (ARRAY_AGG(o.customer_email ORDER BY o.created_at DESC))[1] AS email,
             count(*)::int AS order_count,
             COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled', 'failed', 'refunded')
                               THEN o.total_bdt ELSE 0 END), 0)::int AS total_spent_bdt,
             MAX(o.created_at) AS last_order_at
        FROM public.orders o
       GROUP BY o.customer_phone
       ORDER BY MAX(o.created_at) DESC
    ) t
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_customers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_customers() TO authenticated;

-- Dashboard summary (T-41): orders still to fulfil (any status that
-- is not a terminal one), products with stock_total <= 2 (active
-- products only), orders placed in the last 7 days, the latest 10
-- orders (same shape as admin_list_orders rows), and the low-stock
-- list (slug, name, stock_total).
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'orders_to_fulfil', (
      SELECT count(*)::int FROM public.orders
       WHERE status IN ('placed', 'confirmed', 'processing', 'packed',
                        'shipped', 'out_for_delivery')
    ),
    'low_stock_count', (
      SELECT count(*)::int FROM public.products
       WHERE status = 'active' AND stock_total <= 2
    ),
    'new_orders_7d', (
      SELECT count(*)::int FROM public.orders
       WHERE created_at >= now() - interval '7 days'
    ),
    'recent_orders', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT o.id, o.reference, o.customer_name, o.customer_phone,
               o.customer_email, o.delivery_address AS address,
               o.delivery_zone AS zone, o.payment_method,
               o.payment_status, o.payment_reference,
               o.total_bdt, o.status, o.created_at
          FROM public.orders o
         ORDER BY o.created_at DESC
         LIMIT 10
      ) t
    ),
    'low_stock', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT slug, name, stock_total
          FROM public.products
         WHERE status = 'active' AND stock_total <= 2
         ORDER BY stock_total ASC, name ASC
      ) t
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;

-- Revenue + order counts per day for the last p_days days (default
-- 30, clamped to 1..365). Days with no orders appear as 0, via
-- generate_series. Revenue rule (see header): Cancelled / Failed /
-- Refunded orders are excluded.
CREATE OR REPLACE FUNCTION public.admin_revenue_series(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_days := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT d.day AS day,
             COALESCE(SUM(o.total_bdt), 0)::int AS revenue_bdt,
             count(o.id)::int AS orders
        FROM generate_series(
               CURRENT_DATE - (v_days - 1) * interval '1 day',
               CURRENT_DATE,
               interval '1 day'
             ) AS d(day)
        LEFT JOIN public.orders o
          ON o.created_at::date = d.day
         AND o.status NOT IN ('cancelled', 'failed', 'refunded')
       GROUP BY d.day
       ORDER BY d.day ASC
    ) t
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revenue_series(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revenue_series(int) TO authenticated;

-- Top 10 products by revenue over the last p_days days (default 30,
-- clamped to 1..365). Same order filter as admin_revenue_series.
CREATE OR REPLACE FUNCTION public.admin_best_sellers(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_days := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT oi.product_slug AS slug,
             oi.product_name AS name,
             SUM(oi.quantity)::int AS qty,
             SUM(oi.line_total_bdt)::int AS revenue_bdt
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE o.created_at >= now() - v_days * interval '1 day'
         AND o.status NOT IN ('cancelled', 'failed', 'refunded')
       GROUP BY oi.product_slug, oi.product_name
       ORDER BY SUM(oi.line_total_bdt) DESC, SUM(oi.quantity) DESC
       LIMIT 10
    ) t
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_best_sellers(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_best_sellers(int) TO authenticated;

-- Summary totals over the last p_days days (default 30, clamped to
-- 1..365): revenue, order count, average order value (rounded, 0
-- when there are no orders). Same order filter as
-- admin_revenue_series.
CREATE OR REPLACE FUNCTION public.admin_sales_summary(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_revenue int;
  v_orders int;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_days := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);

  SELECT COALESCE(SUM(total_bdt), 0)::int, count(*)::int
    INTO v_revenue, v_orders
    FROM public.orders
   WHERE created_at >= now() - v_days * interval '1 day'
     AND status NOT IN ('cancelled', 'failed', 'refunded');

  RETURN jsonb_build_object(
    'revenue_bdt', v_revenue,
    'orders', v_orders,
    'avg_order_bdt', CASE WHEN v_orders = 0 THEN 0
                          ELSE round(v_revenue::numeric / v_orders)::int END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sales_summary(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sales_summary(int) TO authenticated;

-- Move an order to a new status. Accepts a database value or a
-- display label (see normalize_order_status). Behaviour, in order:
--   not admin                          -> {"ok": false, "error": "forbidden"}
--   reference not found                -> {"ok": false, "error": "not_found"}
--   p_status not a known status        -> {"ok": false, "error": "invalid_status"}
--   current status is terminal
--     (cancelled / failed / refunded) -> {"ok": false, "error": "invalid_transition"}
--     (Delivered is NOT terminal — Delivered -> Returned -> Refunded
--     is the returns workflow; see the header note.)
--   otherwise: insert an order_status_events row (from -> to, with
--     the note; a cancel with no note stores 'Cancelled by admin')
--     and update orders.status, then {"ok": true}.
-- NOTE: stock IS restored when an admin cancels (see header) — the
--   same restore as cancel_guest_order (migration 0003).
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_reference text,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_status text;
  v_note text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE reference = btrim(COALESCE(p_reference, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_status := public.normalize_order_status(p_status);
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  IF v_order.status IN ('cancelled', 'failed', 'refunded') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition');
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_status = 'cancelled' AND v_note IS NULL THEN
    v_note := 'Cancelled by admin';
  END IF;

  UPDATE public.orders
     SET status = v_status, updated_at = now()
   WHERE id = v_order.id;

  -- Admin cancel restores stock, like the guest cancel
  -- (cancel_guest_order, migration 0003). Only 'cancelled' restores;
  -- returns / refunds do not (the item already left the shop).
  IF v_status = 'cancelled' THEN
    UPDATE public.products p
       SET stock_total = p.stock_total + oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id = v_order.id
       AND p.id = oi.product_id;
  END IF;

  INSERT INTO public.order_status_events (order_id, from_status, to_status, note)
  VALUES (v_order.id, v_order.status, v_status, v_note);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(text, text, text) TO authenticated;

-- Move an order's payment status. Same transition rules as
-- mark_order_payment_status (migration 0004): only a 'pending'
-- payment can move, to 'paid' or 'failed'. Behaviour, in order:
--   not admin                          -> {"ok": false, "error": "forbidden"}
--   reference not found                -> {"ok": false, "error": "not_found"}
--   p_status NOT IN ('paid','failed')  -> {"ok": false, "error": "invalid_status"}
--   current payment_status <> 'pending' -> {"ok": false, "error": "invalid_transition"}
--   otherwise: update orders.payment_status AND the latest payments
--   row for that order, and return {"ok": true}.
-- This is the ADMIN path. The webhook keeps using
-- mark_order_payment_status (migration 0004) — do not merge the two.
CREATE OR REPLACE FUNCTION public.admin_update_payment_status(
  p_reference text,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE reference = btrim(COALESCE(p_reference, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('paid', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  IF v_order.payment_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition');
  END IF;

  UPDATE public.orders
     SET payment_status = p_status, updated_at = now()
   WHERE id = v_order.id;

  SELECT id INTO v_payment_id
    FROM public.payments
   WHERE order_id = v_order.id
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_payment_id IS NOT NULL THEN
    UPDATE public.payments
       SET status = p_status
     WHERE id = v_payment_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_payment_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_payment_status(text, text) TO authenticated;

-- --------------------------------------------------------------------------
-- 7. create_guest_order — settings-driven totals + disabled-method
--    rejection (S-4). Same 5-argument arity as migration 0004, so
--    CREATE OR REPLACE updates it in place (no DROP). Everything else
--    is unchanged from migration 0004: customer validation, TrxID /
--    sender validation for mobile banking, item pricing from the DB,
--    guarded stock decrement, reference generation, payments row.
--
--    What changed:
--    * Tax % + delivery fees are read from public.site_settings
--      (id = 1) and fall back to 5 / 60 / 120 (DEMO CONFIG) when the
--      row is missing — e.g. migration 0005 not run yet.
--    * A payment method disabled in site_settings is rejected with
--      RAISE EXCEPTION 'payment_method_disabled'. NOTE for the API
--      layer: lib/supabase/orders.ts mapCreateOrderError only maps
--      messages starting with 'invalid_' to VALIDATION, so this
--      message currently surfaces as a generic 500 until that
--      mapping is extended — the RAISE string itself is kept as
--      specified ('payment_method_disabled').
--    * mark_order_payment_status and lookup_guest_order are NOT
--      touched here (mark_order_payment_status is the webhook's
--      function — see the header).
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_guest_order(
  p_customer jsonb,
  p_payment_method text,
  p_items jsonb,
  p_payment_reference text DEFAULT NULL,
  p_payment_sender text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_zone text;
  v_payment_reference text;
  v_payment_sender text;
  v_payment_status text;
  v_item jsonb;
  v_slug text;
  v_colour text;
  v_qty int;
  v_product_id uuid;
  v_product_name text;
  v_product_price int;
  v_product_stock int;
  v_variant_price int;
  v_unit_price int;
  v_subtotal int := 0;
  v_tax int;
  v_delivery_fee int;
  v_total int;
  v_reference text;
  v_order_id uuid;
  v_tax_rate int;
  v_fee_inside int;
  v_fee_outside int;
  v_pay_cod bool;
  v_pay_bkash bool;
  v_pay_nagad bool;
  v_pay_rocket bool;
  v_pay_card bool;
  v_attempts int := 0;
  -- Accumulated order lines (validated + priced in the first pass).
  v_ids uuid[] := '{}';
  v_slugs text[] := '{}';
  v_names text[] := '{}';
  v_colours text[] := '{}';
  v_prices int[] := '{}';
  v_qtys int[] := '{}';
  v_line_totals int[] := '{}';
  i int;
BEGIN
  -- ---- Customer validation (messages prefixed with the field) ----
  v_name := NULLIF(btrim(COALESCE(p_customer ->> 'name', '')), '');
  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  v_phone := normalize_bd_phone(p_customer ->> 'phone');
  IF v_phone !~ '^01[3-9][0-9]{8}$' THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  v_email := btrim(COALESCE(p_customer ->> 'email', ''));
  IF char_length(v_email) = 0 OR char_length(v_email) > 100
     OR position('@' IN v_email) < 2 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  v_address := NULLIF(btrim(COALESCE(p_customer ->> 'address', '')), '');
  IF v_address IS NULL OR char_length(v_address) < 10 OR char_length(v_address) > 500 THEN
    RAISE EXCEPTION 'invalid_address';
  END IF;

  v_zone := p_customer ->> 'zone';
  IF v_zone IS NULL OR v_zone NOT IN ('inside', 'outside') THEN
    RAISE EXCEPTION 'invalid_zone';
  END IF;

  IF p_payment_method IS NULL
     OR p_payment_method NOT IN ('cod', 'bkash', 'nagad', 'rocket', 'card') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;

  -- ---- Shop settings (S-4): tax + delivery come from site_settings
  --      (single row, id = 1), falling back to the DEMO CONFIG values
  --      (tax 5%, Inside 60, Outside 120) when the row is missing
  --      (e.g. migration 0005 not run yet, or the row was deleted).
  --      A payment method disabled in settings cannot be used to
  --      place an order ('payment_method_disabled'). ----
  SELECT tax_rate_percent, delivery_inside_fee_bdt, delivery_outside_fee_bdt,
         payment_cod_enabled, payment_bkash_enabled, payment_nagad_enabled,
         payment_rocket_enabled, payment_card_enabled
    INTO v_tax_rate, v_fee_inside, v_fee_outside,
         v_pay_cod, v_pay_bkash, v_pay_nagad, v_pay_rocket, v_pay_card
    FROM public.site_settings
   WHERE id = 1;
  IF NOT FOUND THEN
    v_tax_rate := 5;
    v_fee_inside := 60;
    v_fee_outside := 120;
    v_pay_cod := true;
    v_pay_bkash := true;
    v_pay_nagad := true;
    v_pay_rocket := true;
    v_pay_card := true;
  END IF;

  IF (p_payment_method = 'cod' AND NOT v_pay_cod)
     OR (p_payment_method = 'bkash' AND NOT v_pay_bkash)
     OR (p_payment_method = 'nagad' AND NOT v_pay_nagad)
     OR (p_payment_method = 'rocket' AND NOT v_pay_rocket)
     OR (p_payment_method = 'card' AND NOT v_pay_card) THEN
    RAISE EXCEPTION 'payment_method_disabled';
  END IF;

  -- ---- Payment details (S-3, demo-safe) ----
  -- Mobile banking (bkash/nagad/rocket): TrxID + sender number are
  -- required. COD and card: no payment details are collected; any
  -- values sent are ignored (the API schema already rejects them).
  v_payment_reference := NULL;
  v_payment_sender := NULL;
  IF p_payment_method IN ('bkash', 'nagad', 'rocket') THEN
    v_payment_reference := NULLIF(btrim(COALESCE(p_payment_reference, '')), '');
    IF v_payment_reference IS NULL
       OR v_payment_reference !~ '^[A-Za-z0-9]{8,12}$' THEN
      RAISE EXCEPTION 'invalid_payment_reference';
    END IF;
    v_payment_sender := normalize_bd_phone(p_payment_sender);
    IF v_payment_sender !~ '^01[3-9][0-9]{8}$' THEN
      RAISE EXCEPTION 'invalid_payment_sender';
    END IF;
    v_payment_status := 'pending';
  ELSIF p_payment_method = 'cod' THEN
    v_payment_status := 'cod';
  ELSE -- card
    v_payment_status := 'pending';
  END IF;

  -- ---- Items shape validation ----
  IF jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1
     OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  -- ---- First pass: validate + price every line from the DB ----
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'invalid_items';
    END IF;

    v_slug := v_item ->> 'slug';
    IF v_slug IS NULL OR v_slug !~ '^[a-z0-9-]+$' THEN
      RAISE EXCEPTION 'invalid_slug';
    END IF;

    IF (v_item ->> 'quantity') IS NULL
       OR (v_item ->> 'quantity') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    v_qty := (v_item ->> 'quantity')::int;
    IF v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    v_colour := NULLIF(v_item ->> 'variant_colour', '');

    -- Lock the product row: the stock check + decrement below are atomic.
    SELECT id, name, price_bdt, stock_total
      INTO v_product_id, v_product_name, v_product_price, v_product_stock
      FROM public.products
     WHERE slug = v_slug AND status = 'active'
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found:%', v_slug;
    END IF;
    IF v_product_stock < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_slug;
    END IF;

    -- Variant price wins only when the colour matches a variant row
    -- WITH a non-null price; otherwise the product price applies.
    v_variant_price := NULL;
    IF v_colour IS NOT NULL THEN
      SELECT price_bdt INTO v_variant_price
        FROM public.product_variants
       WHERE product_id = v_product_id AND colour = v_colour;
    END IF;
    IF v_variant_price IS NOT NULL THEN
      v_unit_price := v_variant_price;
    ELSE
      v_unit_price := v_product_price;
    END IF;

    v_ids := array_append(v_ids, v_product_id);
    v_slugs := array_append(v_slugs, v_slug);
    v_names := array_append(v_names, v_product_name);
    v_colours := array_append(v_colours, v_colour);
    v_prices := array_append(v_prices, v_unit_price);
    v_qtys := array_append(v_qtys, v_qty);
    v_line_totals := array_append(v_line_totals, v_unit_price * v_qty);
    v_subtotal := v_subtotal + v_unit_price * v_qty;
  END LOOP;

  -- ---- Totals (S-4: read from site_settings, section 7 above;
  --      DEMO CONFIG 5 / 60 / 120 is the fallback when the row is
  --      missing. Mirrors lib/pricing.ts + lib/demo-config.ts.
  --      Tax rounds to the nearest Taka.) ----
  v_tax := round(v_subtotal * v_tax_rate / 100.0)::int;
  v_delivery_fee := CASE v_zone WHEN 'inside' THEN v_fee_inside ELSE v_fee_outside END;
  v_total := v_subtotal + v_tax + v_delivery_fee;

  -- ---- Reference: 'RB-2026-' + 6 random digits; retry on collision ----
  LOOP
    v_reference := 'RB-2026-' || lpad(((floor(random() * 900000) + 100000)::int)::text, 6, '0');
    BEGIN
      INSERT INTO public.orders (
        reference, customer_name, customer_phone, customer_email,
        delivery_address, delivery_zone, payment_method,
        payment_status, payment_reference, payment_sender,
        subtotal_bdt, tax_bdt, delivery_fee_bdt, total_bdt, status
      ) VALUES (
        v_reference, v_name, v_phone, v_email,
        v_address, v_zone, p_payment_method,
        v_payment_status, v_payment_reference, v_payment_sender,
        v_subtotal, v_tax, v_delivery_fee, v_total, 'placed'
      ) RETURNING id INTO v_order_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts >= 5 THEN
        RAISE EXCEPTION 'reference_generation_failed';
      END IF;
    END;
  END LOOP;

  -- ---- Payments row: one per order, same transaction, amount = total ----
  INSERT INTO public.payments (
    order_id, method, reference, sender_number, amount_bdt, status
  ) VALUES (
    v_order_id, p_payment_method,
    v_payment_reference, v_payment_sender, v_total, v_payment_status
  );

  -- ---- Second pass: items + guarded stock decrement + first event ----
  FOR i IN 1 .. array_length(v_ids, 1)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_slug, product_name, variant_colour,
      unit_price_bdt, quantity, line_total_bdt
    ) VALUES (
      v_order_id, v_ids[i], v_slugs[i], v_names[i], v_colours[i],
      v_prices[i], v_qtys[i], v_line_totals[i]
    );

    UPDATE public.products
       SET stock_total = stock_total - v_qtys[i]
     WHERE id = v_ids[i] AND stock_total >= v_qtys[i];
    IF NOT FOUND THEN
      -- Cannot happen after the locked check above, unless stock moved
      -- under us; raise so the whole order rolls back.
      RAISE EXCEPTION 'insufficient_stock:%', v_slugs[i];
    END IF;
  END LOOP;

  INSERT INTO public.order_status_events (order_id, from_status, to_status)
  VALUES (v_order_id, NULL, 'placed');

  RETURN jsonb_build_object('reference', v_reference, 'total_bdt', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_order(jsonb, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb, text, jsonb, text, text) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 8. VERIFICATION (read-only; the dashboard shows the result grid)
--    Expected after a successful run on a fresh database:
--      admins 0 (the owner creates the admin user after this runs)
--      site_settings 1 | discount_codes 1 (DEMO10)
--      bucket product-images exists, public
--      functions: is_admin, am_i_admin, normalize_order_status,
--        admin_list_orders, admin_get_order, admin_list_customers,
--        admin_dashboard_stats, admin_revenue_series,
--        admin_best_sellers, admin_sales_summary,
--        admin_update_order_status, admin_update_payment_status,
--        create_guest_order (5 arguments, settings-driven)
--      policies: site_settings 2 (select public + admin all),
--        discount_codes 1 (admin all), catalogue tables 1 admin-all
--        policy each (plus their S-1 anon SELECT policies),
--        storage.objects 4 for bucket product-images
--      NO policies at all on orders / order_items /
--        order_status_events / payments (deny-by-default, unchanged)
-- --------------------------------------------------------------------------
-- SELECT 'admins' AS table_name, count(*) AS rows FROM public.admins;
-- SELECT 'site_settings' AS table_name, count(*) AS rows FROM public.site_settings;
-- SELECT 'discount_codes' AS table_name, count(*) AS rows FROM public.discount_codes;
-- SELECT * FROM public.site_settings WHERE id = 1;
-- SELECT * FROM public.discount_codes;
-- SELECT id, name, public FROM storage.buckets WHERE id = 'product-images';
--
-- SELECT proname AS function_name,
--        pg_get_function_arguments(oid) AS arguments
--   FROM pg_proc
--  WHERE proname IN ('is_admin', 'am_i_admin', 'normalize_order_status',
--                    'admin_list_orders', 'admin_get_order',
--                    'admin_list_customers', 'admin_dashboard_stats',
--                    'admin_revenue_series', 'admin_best_sellers',
--                    'admin_sales_summary', 'admin_update_order_status',
--                    'admin_update_payment_status', 'create_guest_order')
--  ORDER BY proname;
--
-- SELECT tablename, policyname FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('admins', 'site_settings', 'discount_codes',
--                      'products', 'product_variants', 'product_images',
--                      'product_measurements', 'categories',
--                      'orders', 'order_items', 'order_status_events',
--                      'payments')
--  ORDER BY tablename, policyname;
-- -- (expect: admins 0 policies; orders / order_items /
-- --  order_status_events / payments 0 policies; site_settings 2;
-- --  discount_codes 1; catalogue tables 2 each — S-1 anon SELECT +
-- --  S-4 admin ALL.)
--
-- SELECT policyname FROM pg_policies
--  WHERE schemaname = 'storage' AND tablename = 'objects'
--    AND policyname LIKE 'product-images%';
-- -- (expect 4 rows: public read, admin insert/update/delete.)
