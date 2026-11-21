-- ============================================================================
-- Rabby e-commerce — S-2 orders migration
-- File: supabase/migrations/0003_s2_orders.sql
-- Project: rabby-ecommerce-test (Supabase, Singapore, Free)
-- Date: 2026-11-18
--
-- HOW TO APPLY (owner / browser session):
--   Supabase Dashboard -> project rabby-ecommerce-test -> SQL Editor
--   -> New query -> paste this WHOLE file -> Run.
--   It is safe to re-run: tables use IF NOT EXISTS, functions use
--   CREATE OR REPLACE, indexes use IF NOT EXISTS. There is NO seed data
--   here — orders are created only by real guest checkouts, so the
--   verification counts below are 0 rows on a fresh database.
--
-- SCOPE: S-2 ONLY — orders, order_items, order_status_events, plus the
-- four SECURITY DEFINER functions the API routes call. Do NOT create
-- customers / admin_users / payment_config / delivery_config /
-- discount_config / site_settings here — those land in S-3/S-4.
--
-- SECURITY (audit §5 — RLS FIRST, before any function):
--   * RLS is enabled on EVERY table at creation, deny-by-default.
--   * There are NO POLICIES AT ALL on orders, order_items, or
--     order_status_events — anon and authenticated have NO direct access
--     to these tables, not even SELECT. This is a DELIBERATE deviation
--     from the kickoff pack's "anon INSERT-only" line: the transactional
--     stock decrement requires the SECURITY DEFINER functions below, and
--     no direct anon writes is strictly more secure — a direct INSERT
--     policy would let anyone insert orders with arbitrary totals,
--     bypassing the stock checks. Access is ONLY through the functions.
--   * The functions run SECURITY DEFINER (as the table owner) with
--     search_path fixed to public, and EXECUTE is granted only to anon
--     and authenticated (PUBLIC is revoked first). They validate every
--     input, recompute prices from the products table (never trusting
--     client-sent prices), and run as a single transaction — any RAISE
--     rolls everything back.
--   * The anon key is public by design; RLS + SECURITY DEFINER
--     functions (not key secrecy) are the protection. Never put the
--     service_role key in NEXT_PUBLIC_*.
--
-- MONEY: integer BDT only (all *_bdt int, never float/double).
-- DEMO CONFIG: tax 5% + delivery Inside Dhaka ৳60 / Outside Dhaka ৳120
--   mirror lib/demo-config.ts (DEMO_TAX_RATE_PERCENT,
--   DELIVERY_OPTIONS) — change both together. S-4 Admin will own these
--   values (FR-16–FR-19).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. TABLES
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         text NOT NULL UNIQUE, -- e.g. 'RB-2026-123456'
  customer_name     text NOT NULL,
  customer_phone    text NOT NULL, -- normalised 01XXXXXXXXX (11 digits)
  customer_email    text NOT NULL,
  delivery_address  text NOT NULL,
  delivery_zone     text NOT NULL CHECK (delivery_zone IN ('inside', 'outside')),
  payment_method    text NOT NULL CHECK (payment_method IN ('cod', 'bkash', 'nagad', 'rocket', 'card')),
  subtotal_bdt      int NOT NULL CHECK (subtotal_bdt >= 0),
  tax_bdt           int NOT NULL CHECK (tax_bdt >= 0),
  delivery_fee_bdt  int NOT NULL CHECK (delivery_fee_bdt >= 0),
  total_bdt         int NOT NULL CHECK (total_bdt >= 0),
  status            text NOT NULL DEFAULT 'placed'
                    CHECK (status IN ('placed', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'failed', 'returned', 'refunded')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES public.products (id),
  product_slug    text NOT NULL,
  product_name    text NOT NULL, -- snapshot: the name at order time
  variant_colour  text,
  unit_price_bdt  int NOT NULL CHECK (unit_price_bdt > 0),
  quantity        int NOT NULL CHECK (quantity > 0),
  line_total_bdt  int NOT NULL CHECK (line_total_bdt >= 0)
);

CREATE TABLE IF NOT EXISTS public.order_status_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  from_status text, -- NULL for the first event (order placed)
  to_status   text NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Helpful read indexes (idempotent).
CREATE INDEX IF NOT EXISTS idx_orders_reference
  ON public.orders (reference);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_events_order_id
  ON public.order_status_events (order_id);

-- --------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY — deny-by-default, NO POLICIES (see header).
--    Enable RLS on every table. No GRANTs and no policies are given to
--    anon or authenticated on any of these tables: the only access path
--    is the SECURITY DEFINER functions in section 3, which run as the
--    table owner and bypass RLS.
-- --------------------------------------------------------------------------

ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_events  ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 3. FUNCTIONS — SECURITY DEFINER, search_path fixed to public.
--    All input validation happens here, in the database, so no caller
--    (not even a future admin path) can bypass it.
-- --------------------------------------------------------------------------

-- Normalise a Bangladeshi mobile to 01XXXXXXXXX (11 digits).
-- Mirrors lib/checkout-validation.ts normalizePhone — keep both in sync.
-- Strips every non-digit, then: '880…' (13 digits) -> '0' + rest;
-- '01…' (11 digits) -> unchanged; anything else -> the bare digits
-- (the callers then reject it against ^01[3-9][0-9]{8}$).
CREATE OR REPLACE FUNCTION public.normalize_bd_phone(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
BEGIN
  v_digits := regexp_replace(COALESCE(p, ''), '\D', '', 'g');
  IF length(v_digits) = 13 AND substr(v_digits, 1, 3) = '880' THEN
    RETURN '0' || substr(v_digits, 4);
  ELSIF length(v_digits) = 11 AND substr(v_digits, 1, 2) = '01' THEN
    RETURN v_digits;
  ELSE
    RETURN v_digits;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_bd_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_bd_phone(text) TO anon, authenticated;

-- Create a guest order in ONE transaction: validate, price from the
-- products table, decrement stock, insert order + items + first event.
-- Any RAISE rolls everything back — no partial order can ever exist.
-- Returns jsonb: {"reference": "RB-2026-123456", "total_bdt": 1234}.
CREATE OR REPLACE FUNCTION public.create_guest_order(
  p_customer jsonb,
  p_payment_method text,
  p_items jsonb
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

  -- ---- Totals (DEMO CONFIG — mirrors lib/demo-config.ts + lib/pricing.ts;
  --      change both together. Tax rounds to the nearest Taka.) ----
  v_tax := round(v_subtotal * 5 / 100.0)::int; -- 5% DEMO CONFIG
  v_delivery_fee := CASE v_zone WHEN 'inside' THEN 60 ELSE 120 END; -- DEMO CONFIG
  v_total := v_subtotal + v_tax + v_delivery_fee;

  -- ---- Reference: 'RB-2026-' + 6 random digits; retry on collision ----
  LOOP
    v_reference := 'RB-2026-' || lpad(((floor(random() * 900000) + 100000)::int)::text, 6, '0');
    BEGIN
      INSERT INTO public.orders (
        reference, customer_name, customer_phone, customer_email,
        delivery_address, delivery_zone, payment_method,
        subtotal_bdt, tax_bdt, delivery_fee_bdt, total_bdt, status
      ) VALUES (
        v_reference, v_name, v_phone, v_email,
        v_address, v_zone, p_payment_method,
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

REVOKE ALL ON FUNCTION public.create_guest_order(jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb, text, jsonb) TO anon, authenticated;

-- Look up one order by reference + phone. Returns NULL when the
-- reference does not exist OR the phone does not match — never reveal
-- which one failed (no order enumeration via phone probing).
CREATE OR REPLACE FUNCTION public.lookup_guest_order(
  p_reference text,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_phone text;
BEGIN
  v_phone := normalize_bd_phone(p_phone);
  SELECT * INTO v_order
    FROM public.orders
   WHERE reference = btrim(COALESCE(p_reference, ''));
  IF NOT FOUND OR v_order.customer_phone <> v_phone THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'reference', v_order.reference,
    'status', v_order.status,
    'customer_name', v_order.customer_name,
    'customer_phone', v_order.customer_phone,
    'customer_email', v_order.customer_email,
    'delivery_address', v_order.delivery_address,
    'delivery_zone', v_order.delivery_zone,
    'payment_method', v_order.payment_method,
    'subtotal_bdt', v_order.subtotal_bdt,
    'tax_bdt', v_order.tax_bdt,
    'delivery_fee_bdt', v_order.delivery_fee_bdt,
    'total_bdt', v_order.total_bdt,
    'created_at', v_order.created_at,
    'items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'product_slug', product_slug,
        'product_name', product_name,
        'variant_colour', variant_colour,
        'unit_price_bdt', unit_price_bdt,
        'quantity', quantity,
        'line_total_bdt', line_total_bdt
      ) ORDER BY product_slug), '[]'::jsonb)
      FROM public.order_items
      WHERE order_id = v_order.id
    ),
    'events', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'from_status', from_status,
        'to_status', to_status,
        'created_at', created_at
      ) ORDER BY created_at ASC), '[]'::jsonb)
      FROM public.order_status_events
      WHERE order_id = v_order.id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_guest_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_guest_order(text, text) TO anon, authenticated;

-- Cancel a guest order (reference + phone). Returns
--   {"ok": true}                          on success (stock restored),
--   {"ok": false, "error": "not_found"}   when the reference/phone do not match,
--   {"ok": false, "error": "too_late"}    when the order already shipped
--   (status NOT IN placed/confirmed/processing/packed).
CREATE OR REPLACE FUNCTION public.cancel_guest_order(
  p_reference text,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_phone text;
BEGIN
  v_phone := normalize_bd_phone(p_phone);
  SELECT * INTO v_order
    FROM public.orders
   WHERE reference = btrim(COALESCE(p_reference, ''));
  IF NOT FOUND OR v_order.customer_phone <> v_phone THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_order.status NOT IN ('placed', 'confirmed', 'processing', 'packed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late');
  END IF;

  UPDATE public.orders
     SET status = 'cancelled', updated_at = now()
   WHERE id = v_order.id;

  -- Restore stock for every line of the cancelled order.
  UPDATE public.products p
     SET stock_total = p.stock_total + oi.quantity
    FROM public.order_items oi
   WHERE oi.order_id = v_order.id
     AND p.id = oi.product_id;

  INSERT INTO public.order_status_events (order_id, from_status, to_status)
  VALUES (v_order.id, v_order.status, 'cancelled');

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_guest_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_guest_order(text, text) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 4. VERIFICATION (read-only; the dashboard shows the result grid)
--    Expected after a successful run on a fresh database:
--      orders 0 | order_items 0 | order_status_events 0
--      (no orders exist until a real guest checkout creates one), and
--      the four functions exist:
--        normalize_bd_phone, create_guest_order,
--        lookup_guest_order, cancel_guest_order
-- --------------------------------------------------------------------------
-- SELECT 'orders' AS table_name, count(*) AS rows FROM public.orders
-- UNION ALL SELECT 'order_items', count(*) FROM public.order_items
-- UNION ALL SELECT 'order_status_events', count(*) FROM public.order_status_events;
--
-- SELECT proname AS function_name
--   FROM pg_proc
--  WHERE proname IN ('normalize_bd_phone', 'create_guest_order',
--                    'lookup_guest_order', 'cancel_guest_order')
--  ORDER BY proname;
