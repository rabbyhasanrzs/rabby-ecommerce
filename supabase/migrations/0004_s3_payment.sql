-- ============================================================================
-- Rabby e-commerce — S-3 payment migration
-- File: supabase/migrations/0004_s3_payment.sql
-- Project: rabby-ecommerce-test (Supabase, Singapore, Free)
-- Date: 2026-11-22
--
-- HOW TO APPLY (owner / browser session):
--   Supabase Dashboard -> project rabby-ecommerce-test -> SQL Editor
--   -> New query -> paste this WHOLE file -> Run.
--   It is safe to re-run: tables use IF NOT EXISTS, columns use
--   ADD COLUMN IF NOT EXISTS, functions use CREATE OR REPLACE (plus a
--   DROP ... IF EXISTS for the old 3-argument create_guest_order, whose
--   arity CREATE OR REPLACE cannot change — see section 3). There is NO
--   seed data here — payments are created only by real guest checkouts,
--   so the verification counts below are 0 rows on a fresh database.
--
-- SCOPE: S-3 ONLY (demo-safe payment, owner decision D-1) — payments
-- table, payment columns on orders, payment validation inside
-- create_guest_order, mark_order_payment_status (called by Slice B's
-- webhook), and the three new lookup fields in lookup_guest_order.
-- No admin / settings tables here — those land in S-4.
--
-- SECURITY (same rule as migration 0003 — RLS FIRST, before any function):
--   * RLS is enabled on payments at creation, deny-by-default.
--   * There are NO POLICIES AT ALL on payments (nor on orders,
--     order_items, or order_status_events) — anon and authenticated
--     have NO direct access to these tables, not even SELECT. Access
--     is ONLY through the SECURITY DEFINER functions below, which run
--     as the table owner and bypass RLS.
--   * The functions run SECURITY DEFINER (as the table owner) with
--     search_path fixed to public, and EXECUTE is granted only to anon
--     and authenticated (PUBLIC is revoked first).
--   * The anon key is public by design; RLS + SECURITY DEFINER
--     functions (not key secrecy) are the protection. Never put the
--     service_role key in NEXT_PUBLIC_*.
--
-- MONEY: integer BDT only (all *_bdt int, never float/double).
-- DEMO CONFIG: tax 5% + delivery Inside Dhaka ৳60 / Outside Dhaka ৳120
--   mirror lib/demo-config.ts (DEMO_TAX_RATE_PERCENT,
--   DELIVERY_OPTIONS) — change both together. S-4 Admin will own these
--   values (FR-16–FR-19).
-- DEMO-SAFE PAYMENT (D-1): no gateway, no real money moves in S-3.
--   COD works fully (pay on delivery). bKash / Nagad / Rocket use the
--   manual flow: the customer pays first, then enters the Transaction
--   ID (TrxID) + sender number, which the owner verifies. Card details
--   are NEVER collected — card payment is confirmed after the order.
--   The TrxID check below (8–12 alphanumeric characters) is a
--   demo-safe approximation: real bKash/Nagad/Rocket TrxIDs are
--   10 alphanumeric characters, but no provider publishes the format
--   as a strict rule, so S-3 accepts 8–12 rather than rejecting a
--   genuine ID. A real gateway (S-6 / launch) replaces this check.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. PAYMENTS TABLE
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  method        text NOT NULL CHECK (method IN ('cod', 'bkash', 'nagad', 'rocket', 'card')),
  reference     text, -- mobile-banking Transaction ID (TrxID); NULL for COD/card
  sender_number text, -- normalised 01XXXXXXXXX mobile that sent the money; NULL for COD/card
  amount_bdt    int NOT NULL CHECK (amount_bdt >= 0),
  status        text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'cod')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Helpful read index (idempotent).
CREATE INDEX IF NOT EXISTS idx_payments_order_id
  ON public.payments (order_id);

-- --------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY — deny-by-default, NO POLICIES (see header).
--    Enable RLS on payments. No GRANTs and no policies are given to
--    anon or authenticated: the only access path is the SECURITY
--    DEFINER functions in section 3.
-- --------------------------------------------------------------------------

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 3. ORDERS — payment columns (re-run safe).
--    payment_status: 'cod' for Cash on Delivery orders, 'pending'
--    until the owner verifies a mobile-banking TrxID (or confirms a
--    card payment), 'paid' / 'failed' once Slice B's webhook marks it.
--    Existing orders (created before this migration) get 'pending'.
-- --------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'cod'));
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_sender text;

-- --------------------------------------------------------------------------
-- 4. FUNCTIONS — SECURITY DEFINER, search_path fixed to public.
-- --------------------------------------------------------------------------

-- The S-2 3-argument create_guest_order is replaced by the 5-argument
-- version below. CREATE OR REPLACE cannot change a function's arity,
-- so the old signature is dropped first (IF EXISTS: safe on a fresh
-- database, and safe to re-run). Any caller still using 3 arguments
-- (e.g. the S-2 rls-test.mjs probe) must be updated to pass
-- p_payment_reference / p_payment_sender (null for COD/card).
DROP FUNCTION IF EXISTS public.create_guest_order(jsonb, text, jsonb);

-- Create a guest order in ONE transaction: validate, price from the
-- products table, decrement stock, insert order + items + first event
-- + one payments row. Any RAISE rolls everything back — no partial
-- order can ever exist.
-- Returns jsonb: {"reference": "RB-2026-123456", "total_bdt": 1234}.
-- Payment validation (S-3, demo-safe): for bkash/nagad/rocket the
-- TrxID is required (8–12 alphanumeric characters) and the sender
-- number is required (valid Bangladeshi mobile, normalised the same
-- way as the customer phone); for cod/card both must be absent and
-- are ignored. New RAISE messages: 'invalid_payment_reference',
-- 'invalid_payment_sender' (mapped to VALIDATION by the API layer,
-- same as every other 'invalid_*' message).
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

-- Mark an order's payment status. Called by Slice B's webhook route
-- (POST /api/webhooks/payment) after signature verification — DO NOT
-- change this signature. Behaviour, in order:
--   order not found (reference trimmed) -> {"ok": false, "error": "not_found"}
--   p_status NOT IN ('paid','failed')  -> {"ok": false, "error": "invalid_status"}
--   current payment_status <> 'pending' -> {"ok": false, "error": "invalid_transition"}
--   otherwise: update orders.payment_status AND the latest payments
--   row for that order, and return {"ok": true}.
-- Only a 'pending' payment can move — a COD order ('cod'), or one
-- already marked 'paid' / 'failed', can never be re-marked.
CREATE OR REPLACE FUNCTION public.mark_order_payment_status(
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

  -- The latest payments row for this order (one row per order in the
  -- S-3 flow; newest first so a future multi-payment flow still
  -- updates the current one). If no row exists, the order update
  -- above still stands.
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

REVOKE ALL ON FUNCTION public.mark_order_payment_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_payment_status(text, text) TO anon, authenticated;

-- Look up one order by reference + phone. Returns NULL when the
-- reference does not exist OR the phone does not match — never reveal
-- which one failed (no order enumeration via phone probing).
-- S-3: the returned jsonb gains payment_status, payment_reference and
-- payment_sender (the sender number is the customer's own number on
-- their own order pages — the pages show the TrxID only, never the
-- sender number). Same signature as migration 0003, so CREATE OR
-- REPLACE updates it in place.
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
    'payment_status', v_order.payment_status,
    'payment_reference', v_order.payment_reference,
    'payment_sender', v_order.payment_sender,
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

-- --------------------------------------------------------------------------
-- 5. VERIFICATION (read-only; the dashboard shows the result grid)
--    Expected after a successful run on a fresh database:
--      payments 0
--      (no payments exist until a real guest checkout creates one), and
--      orders has the three new columns, and the functions exist:
--        create_guest_order (5 arguments), mark_order_payment_status,
--        lookup_guest_order (now returning payment_status,
--        payment_reference, payment_sender)
-- --------------------------------------------------------------------------
-- SELECT 'payments' AS table_name, count(*) AS rows FROM public.payments;
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'orders'
--    AND column_name IN ('payment_status', 'payment_reference', 'payment_sender')
--  ORDER BY column_name;
--
-- SELECT proname AS function_name,
--        pg_get_function_arguments(oid) AS arguments
--   FROM pg_proc
--  WHERE proname IN ('create_guest_order', 'mark_order_payment_status',
--                    'lookup_guest_order')
--  ORDER BY proname;
--
-- -- No policies at all on payments (deny-by-default, same as orders):
-- SELECT tablename, policyname FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'payments';
-- -- (expect 0 rows)
