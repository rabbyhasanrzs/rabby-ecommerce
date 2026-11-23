-- ==========================================================================
-- 0009 — S-7 coupon redemption (T-70, first 1.x feature)
-- ==========================================================================
-- Run this in the Supabase SQL Editor on TEST first, then on PRODUCTION
-- — the same pattern as migrations 0001/0003/0004/0005/0006/0007/0008.
-- Do NOT claim this migration has been run until the owner has run it
-- on a project and the verification queries below have been checked.
-- Re-run safe (ALTER ... ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE,
-- DROP FUNCTION IF EXISTS).
--
-- What this does:
--   1. orders gains discount_code (text, NULL when no code was used)
--      and discount_bdt (int, NOT NULL DEFAULT 0, >= 0) — the code
--      used and the Taka amount taken off, stored on the order row so
--      a later deactivation can never change a past order.
--   2. New SECURITY DEFINER function validate_discount_code(p_code)
--      — the customer-facing read path for discount_codes, which has
--      NO anon policy (admin-only, migration 0005). It normalises the
--      code (trim + uppercase) and returns percent_off. A missing code
--      and an inactive code raise the SAME single error
--      'coupon_invalid' — never reveal which one failed, so codes
--      cannot be enumerated by probing.
--   3. create_guest_order gains a 6th argument
--      p_discount_code text DEFAULT NULL. The old 5-argument version
--      is DROPPED first — CREATE OR REPLACE cannot change arity, and
--      leaving the 5-arg overload in place would let callers bypass
--      the coupon path (same reason as migration 0006 dropping the
--      2-arg mark_order_payment_status). The DEFAULT NULL keeps
--      existing callers working (RLS test, old clients).
--   4. Totals with a code (integer BDT only, round() for percent
--      math — never float/double for money):
--        v_discount           := round(v_subtotal * percent_off / 100.0)::int
--        discounted subtotal  := v_subtotal - v_discount
--        v_tax                := round(discounted_subtotal * v_tax_rate / 100.0)::int
--        v_total              := discounted_subtotal + v_tax + v_delivery_fee
--      Tax is charged on the DISCOUNTED subtotal (owner decision,
--      S-7). With no code the discount is 0 and the math is
--      byte-identical to before (tax on the full subtotal).
--   5. lookup_guest_order and admin_get_order return discount_code
--      and discount_bdt alongside the existing fields. Nothing else
--      in either function changes (lookup keeps the 0006 shape — no
--      customer_email, no payment_sender).
--
-- What this does NOT do: the discount_codes table shape is unchanged
-- (percent-off only — no fixed amount, minimum spend, expiry or usage
-- limits); auth, proxy.ts and demo config values are untouched; the
-- payment_method_disabled RAISE and all other create_guest_order
-- behaviour are unchanged.
--
-- MONEY: integer BDT only (all *_bdt int, never float/double).
-- DEMO CONFIG: unchanged — tax 5% + delivery Inside Dhaka ৳60 /
--   Outside Dhaka ৳120 still come from site_settings (id = 1) with
--   the same 5 / 60 / 120 fallback when the row is missing.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. ORDERS — discount columns (re-run safe: IF NOT EXISTS).
-- --------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_bdt int NOT NULL DEFAULT 0
    CHECK (discount_bdt >= 0);

-- --------------------------------------------------------------------------
-- 2. validate_discount_code — customer-facing coupon check.
--    SECURITY DEFINER (discount_codes has no anon policy) with
--    search_path fixed to public, same style as the existing
--    functions. Callable by anon + authenticated: the validate
--    endpoint calls it with the anon client.
--    Behaviour, in order:
--      code missing OR inactive -> RAISE EXCEPTION 'coupon_invalid'
--        (one error for both — no code-enumeration leak)
--      otherwise -> returns percent_off (1..100, per the table CHECK)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_discount_code(p_code text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_percent_off int;
BEGIN
  v_code := NULLIF(upper(btrim(COALESCE(p_code, ''))), '');
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  SELECT percent_off INTO v_percent_off
    FROM public.discount_codes
   WHERE code = v_code AND active = true;
  IF NOT FOUND THEN
    -- Same error whether the code does not exist or is deactivated.
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  RETURN v_percent_off;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_discount_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_discount_code(text) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. create_guest_order — 6-argument version with coupon redemption.
--    DROP the 5-argument version first (0004 pattern — CREATE OR
--    REPLACE cannot change arity). Everything is unchanged from
--    migration 0005 section 7 except the coupon handling marked
--    below: customer validation, TrxID / sender validation for
--    mobile banking, settings-driven tax/delivery, disabled
--    payment-method rejection, item pricing from the DB, guarded
--    stock decrement, reference generation, payments row.
-- --------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_guest_order(jsonb, text, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.create_guest_order(
  p_customer jsonb,
  p_payment_method text,
  p_items jsonb,
  p_payment_reference text DEFAULT NULL,
  p_payment_sender text DEFAULT NULL,
  p_discount_code text DEFAULT NULL
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
  v_discount_code text;
  v_percent_off int;
  v_discount int := 0;
  v_discounted_subtotal int;
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

  -- ---- Coupon (S-7): normalise the code (trim + uppercase) and look
  --      it up. A missing code and an inactive code raise the SAME
  --      single error 'coupon_invalid' — never reveal which one
  --      failed. With no code the discount is 0 and the totals below
  --      are byte-identical to before. Any RAISE here rolls the whole
  --      order back — a bad code never places an order. ----
  v_discount_code := NULLIF(upper(btrim(COALESCE(p_discount_code, ''))), '');
  IF v_discount_code IS NOT NULL THEN
    SELECT percent_off INTO v_percent_off
      FROM public.discount_codes
     WHERE code = v_discount_code AND active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'coupon_invalid';
    END IF;
    v_discount := round(v_subtotal * v_percent_off / 100.0)::int;
  END IF;

  -- ---- Totals (S-4: read from site_settings, section above;
  --      DEMO CONFIG 5 / 60 / 120 is the fallback when the row is
  --      missing. Mirrors lib/pricing.ts + lib/demo-config.ts.
  --      Tax rounds to the nearest Taka. S-7: tax is charged on the
  --      DISCOUNTED subtotal; with no code v_discount is 0, so
  --      v_discounted_subtotal = v_subtotal and the math is
  --      unchanged.) ----
  v_discounted_subtotal := v_subtotal - v_discount;
  v_tax := round(v_discounted_subtotal * v_tax_rate / 100.0)::int;
  v_delivery_fee := CASE v_zone WHEN 'inside' THEN v_fee_inside ELSE v_fee_outside END;
  v_total := v_discounted_subtotal + v_tax + v_delivery_fee;

  -- ---- Reference: 'RB-2026-' + 6 random digits; retry on collision ----
  LOOP
    v_reference := 'RB-2026-' || lpad(((floor(random() * 900000) + 100000)::int)::text, 6, '0');
    BEGIN
      INSERT INTO public.orders (
        reference, customer_name, customer_phone, customer_email,
        delivery_address, delivery_zone, payment_method,
        payment_status, payment_reference, payment_sender,
        discount_code, discount_bdt,
        subtotal_bdt, tax_bdt, delivery_fee_bdt, total_bdt, status
      ) VALUES (
        v_reference, v_name, v_phone, v_email,
        v_address, v_zone, p_payment_method,
        v_payment_status, v_payment_reference, v_payment_sender,
        v_discount_code, v_discount,
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

REVOKE ALL ON FUNCTION public.create_guest_order(jsonb, text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb, text, jsonb, text, text, text) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 4. lookup_guest_order — same 2-argument signature (CREATE OR REPLACE
--    updates it in place) and the same 0006 shape (no customer_email,
--    no payment_sender), plus the two new discount fields.
-- --------------------------------------------------------------------------
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
    'delivery_address', v_order.delivery_address,
    'delivery_zone', v_order.delivery_zone,
    'payment_method', v_order.payment_method,
    'payment_status', v_order.payment_status,
    'payment_reference', v_order.payment_reference,
    'subtotal_bdt', v_order.subtotal_bdt,
    'tax_bdt', v_order.tax_bdt,
    'delivery_fee_bdt', v_order.delivery_fee_bdt,
    'total_bdt', v_order.total_bdt,
    'discount_code', v_order.discount_code,
    'discount_bdt', v_order.discount_bdt,
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
-- 5. admin_get_order — same 1-argument signature (CREATE OR REPLACE
--    updates it in place), plus the two new discount fields in the
--    order object. The is_admin() gate is unchanged.
-- --------------------------------------------------------------------------
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
      'discount_code', v_order.discount_code,
      'discount_bdt', v_order.discount_bdt,
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

-- --------------------------------------------------------------------------
-- 6. VERIFICATION (read-only; the dashboard shows the result grid)
--    Expected after a successful run:
--      orders has the discount_code (text, nullable) and discount_bdt
--        (int, NOT NULL DEFAULT 0, CHECK >= 0) columns;
--      validate_discount_code(text) exists, SECURITY DEFINER,
--        EXECUTE granted to anon + authenticated;
--      create_guest_order has 6 arguments (the 5-arg version is
--        gone), EXECUTE granted to anon + authenticated;
--      lookup_guest_order still has 2 arguments, admin_get_order
--        still has 1 argument, and both return discount_code +
--        discount_bdt;
--      no order placed without a code changes totals (discount 0).
-- --------------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'orders'
--    AND column_name IN ('discount_code', 'discount_bdt');
-- -- (expect discount_code text YES NULL; discount_bdt integer NO 0)
--
-- SELECT proname AS function_name,
--        pg_get_function_arguments(oid) AS arguments,
--        prosecdef AS security_definer
--   FROM pg_proc
--  WHERE proname IN ('validate_discount_code', 'create_guest_order',
--                    'lookup_guest_order', 'admin_get_order')
--  ORDER BY proname;
-- -- (expect validate_discount_code(text) security_definer = t;
-- --  create_guest_order(jsonb, text, jsonb, text, text, text);
-- --  lookup_guest_order(text, text); admin_get_order(text))
--
-- -- A missing code and a deactivated code must raise the same error
-- -- (run as anon via the REST API, not here):
-- --   POST /rest/v1/rpc/validate_discount_code {"p_code":"NOPE123"}
-- --   -> Postgres error 'coupon_invalid'
-- --   POST /rest/v1/rpc/validate_discount_code {"p_code":"DEMO10"}
-- --   -> Postgres error 'coupon_invalid' (DEMO10 is deactivated live)
-- --   POST /rest/v1/rpc/validate_discount_code {"p_code":"re518"}
-- --   -> 10 (lowercase input normalises; RE518 is active live)
