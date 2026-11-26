-- ==========================================================================
-- 0016 — S-7 SSLCommerz (real payment gateway, owner-approved standard
-- setup): gateway record + 'online' payment method
-- ==========================================================================
-- Run this in the Supabase SQL Editor on TEST first, then on PRODUCTION
-- — the same pattern as migrations 0001/0003/0004/0005/0006/0007/0008/
-- 0009/0010/0011/0012/0013/0014/0015. Do NOT claim this migration has
-- been run until the owner has run it on a project and the verification
-- queries below have been checked. Re-run safe (ADD COLUMN IF NOT
-- EXISTS, DROP CONSTRAINT IF EXISTS + conditional ADD, CREATE OR
-- REPLACE functions).
--
-- What this does:
--   1. Gateway columns on payments (one row per order in the S-3
--      flow, so columns — not a new table — hold the SSLCommerz
--      record: session key, val_id, bank transaction id, card brand,
--      amount received after the fee, risk level). All nullable:
--      COD / manual orders never have them. There is no re-pay in
--      v1, so one attempt per order is the whole story.
--   2. 'online' joins the payment-method lists: payments.method
--      CHECK, orders.payment_method CHECK, and create_guest_order's
--      method list + settings check. The new method behaves like
--      card at order creation: no TrxID / sender, payment_status
--      'pending' until the gateway settles it.
--   3. payment_online_enabled on site_settings (default FALSE — the
--      online method is off until the owner turns it on in Admin
--      Settings, after the sandbox credentials are in).
--   4. admin_get_order returns the gateway fields in its 'payment'
--      object (read-only, for the admin order page) — nothing else
--      about the function changes.
--   5. Two new SECURITY DEFINER functions, both gated by the same
--      payment_webhook_secret as mark_order_payment_status (migration
--      0006): record_gateway_payment (stores the gateway record on
--      the latest payments row, pending-only) and get_gateway_order
--      (the order total + payment state + customer contact the IPN
--      and return handlers need — the guest lookup cannot serve
--      them, it needs the phone).
--
-- What this does NOT do: no change to the pending-only rule
-- (failed stays terminal), no change to order workflow / stock /
-- cancel, no RLS change (no policies on payments — access stays
-- through SECURITY DEFINER functions), no seed rows.
--
-- Owner steps AFTER running this (see the PR body): store the
-- payment webhook secret in server_secrets ('payment_webhook_secret'
-- key) AND set PAYMENT_WEBHOOK_SECRET in Vercel to the same value —
-- without both, the IPN cannot mark anything paid (fail closed).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Gateway columns on payments — re-run safe.
-- --------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway_session_key text,
  ADD COLUMN IF NOT EXISTS gateway_val_id text,
  ADD COLUMN IF NOT EXISTS gateway_bank_tran_id text,
  ADD COLUMN IF NOT EXISTS gateway_card_brand text,
  ADD COLUMN IF NOT EXISTS gateway_store_amount_bdt int,
  ADD COLUMN IF NOT EXISTS gateway_risk_level int;

-- --------------------------------------------------------------------------
-- 2. 'online' in the method CHECKs — re-run safe (DROP + conditional
--    ADD, same pattern as migration 0015).
-- --------------------------------------------------------------------------

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_method_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_method_check'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_method_check
      CHECK (method IN ('cod', 'bkash', 'nagad', 'rocket', 'card', 'online'));
  END IF;
END $$;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_method_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('cod', 'bkash', 'nagad', 'rocket', 'card', 'online'));
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 3. payment_online_enabled on site_settings — off by default.
--    Existing rows get false (NOT NULL DEFAULT false); the owner
--    turns it on in Admin Settings after the sandbox credentials
--    are in. Sandbox/live is env-only, never a settings toggle.
-- --------------------------------------------------------------------------

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS payment_online_enabled bool NOT NULL DEFAULT false;

-- --------------------------------------------------------------------------
-- 4. create_guest_order — same 6-argument signature (CREATE OR
--    REPLACE updates it in place; no DROP needed, arity unchanged).
--    Only the 'online' handling changes (see the diff marks):
--    method list, settings read + disabled check, and the
--    card/online ELSE branch. Everything else is byte-identical to
--    migration 0009.
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
  v_pay_online bool;
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
     OR p_payment_method NOT IN ('cod', 'bkash', 'nagad', 'rocket', 'card', 'online') THEN
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
         payment_rocket_enabled, payment_card_enabled,
         payment_online_enabled
    INTO v_tax_rate, v_fee_inside, v_fee_outside,
         v_pay_cod, v_pay_bkash, v_pay_nagad, v_pay_rocket, v_pay_card,
         v_pay_online
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
    v_pay_online := false;
  END IF;

  IF (p_payment_method = 'cod' AND NOT v_pay_cod)
     OR (p_payment_method = 'bkash' AND NOT v_pay_bkash)
     OR (p_payment_method = 'nagad' AND NOT v_pay_nagad)
     OR (p_payment_method = 'rocket' AND NOT v_pay_rocket)
     OR (p_payment_method = 'card' AND NOT v_pay_card)
     OR (p_payment_method = 'online' AND NOT v_pay_online) THEN
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
  ELSE -- card / online: no payment details are collected; payment stays 'pending'
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
-- 5. admin_get_order — same signature; the 'payment' object gains
--    the six gateway fields (null on pre-0016 rows and on non-online
--    orders). Nothing else changes.
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
        'sender', sender_number,
        'gateway_session_key', gateway_session_key,
        'gateway_val_id', gateway_val_id,
        'gateway_bank_tran_id', gateway_bank_tran_id,
        'gateway_card_brand', gateway_card_brand,
        'gateway_store_amount_bdt', gateway_store_amount_bdt,
        'gateway_risk_level', gateway_risk_level
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
-- 6. record_gateway_payment — store the SSLCommerz record on the
--    latest payments row for one order. Called by the IPN handler
--    and the success-return handler AFTER the Validation API (or
--    Transaction Query) has confirmed the transaction — never on
--    IPN fields alone. Only non-null arguments overwrite a column,
--    so the session key stored at checkout survives the later
--    settle-time call that stores val_id / bank_tran_id / brand /
--    store amount / risk level.
--
--    Secret gate (migration 0006 pattern): p_secret must match the
--    stored 'payment_webhook_secret' — checked FIRST, so an
--    unauthenticated caller learns nothing about the order.
--    Pending-only: a COD order or one already paid/failed returns
--    invalid_transition, so a replayed IPN can never rewrite the
--    record of a settled order.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_gateway_payment(
  p_reference text,
  p_secret text,
  p_session_key text DEFAULT NULL,
  p_val_id text DEFAULT NULL,
  p_bank_tran_id text DEFAULT NULL,
  p_card_brand text DEFAULT NULL,
  p_store_amount_bdt int DEFAULT NULL,
  p_risk_level int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment_id uuid;
  v_stored_secret text;
BEGIN
  SELECT secret INTO v_stored_secret
    FROM public.server_secrets
   WHERE key = 'payment_webhook_secret';
  IF v_stored_secret IS NULL OR p_secret IS NULL
     OR p_secret <> v_stored_secret THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE reference = btrim(COALESCE(p_reference, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_order.payment_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition');
  END IF;

  SELECT id INTO v_payment_id
    FROM public.payments
   WHERE order_id = v_order.id
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_payment_id IS NOT NULL THEN
    UPDATE public.payments
       SET gateway_session_key = COALESCE(p_session_key, gateway_session_key),
           gateway_val_id = COALESCE(p_val_id, gateway_val_id),
           gateway_bank_tran_id = COALESCE(p_bank_tran_id, gateway_bank_tran_id),
           gateway_card_brand = COALESCE(p_card_brand, gateway_card_brand),
           gateway_store_amount_bdt = COALESCE(p_store_amount_bdt, gateway_store_amount_bdt),
           gateway_risk_level = COALESCE(p_risk_level, gateway_risk_level)
     WHERE id = v_payment_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_gateway_payment(text, text, text, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_gateway_payment(text, text, text, text, text, text, int, int) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 7. get_gateway_order — what the IPN and return handlers need to
--    settle one gateway order: the total (to compare against the
--    Validation API amount), the payment state + method, and the
--    customer contact (to send the confirmation email — the guest
--    lookup cannot serve it, it needs the phone, and the IPN has
--    none). Secret-gated like mark_order_payment_status: NULL when
--    the secret is missing / mismatched OR the order does not
--    exist — no oracle either way. No other PII is returned.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_gateway_order(
  p_reference text,
  p_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_stored_secret text;
BEGIN
  SELECT secret INTO v_stored_secret
    FROM public.server_secrets
   WHERE key = 'payment_webhook_secret';
  IF v_stored_secret IS NULL OR p_secret IS NULL
     OR p_secret <> v_stored_secret THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE reference = btrim(COALESCE(p_reference, ''));
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'total_bdt', v_order.total_bdt,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'customer_phone', v_order.customer_phone,
    'customer_email', v_order.customer_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_gateway_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gateway_order(text, text) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 8. Verification (run after applying; all on the project where the
--    migration ran — TEST first, then PRODUCTION)
--    * The gateway columns exist:
--      SELECT column_name FROM information_schema.columns
--       WHERE table_name = 'payments'
--         AND column_name LIKE 'gateway_%' ORDER BY column_name;
--      -- gateway_bank_tran_id | gateway_card_brand |
--      --   gateway_risk_level | gateway_session_key |
--      --   gateway_store_amount_bdt | gateway_val_id
--    * The CHECKs list 'online':
--      SELECT pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conname IN ('payments_method_check',
--                         'orders_payment_method_check');
--      -- CHECK (method IN ('cod', 'bkash', 'nagad', 'rocket',
--      --   'card', 'online')) and the orders equivalent
--    * The toggle exists and is off:
--      SELECT payment_online_enabled FROM public.site_settings
--       WHERE id = 1;
--      -- false
--    * The functions exist:
--      SELECT proname, pg_get_function_arguments(oid) FROM pg_proc
--       WHERE proname IN ('record_gateway_payment',
--                         'get_gateway_order');
--      -- record_gateway_payment(text, text, text, text, text,
--      --   text, integer, integer)
--      -- get_gateway_order(text, text)
--    * An 'online' order can be created only when the toggle is on:
--      (covered by the app tests; the SQL check is the CHECK above)
-- --------------------------------------------------------------------------
