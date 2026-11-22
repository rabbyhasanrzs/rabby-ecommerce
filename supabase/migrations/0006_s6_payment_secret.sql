-- ==========================================================================
-- 0006 — S-6 T-61 security review (findings S6-01, S6-11, S6-15)
-- ==========================================================================
-- Run this in the Supabase SQL Editor BEFORE merging PR "S-6: T-61
-- Security review" — the same pattern as migrations 0001/0003/0004/0005.
-- Re-run safe (every statement is idempotent: IF NOT EXISTS /
-- CREATE OR REPLACE / DROP ... IF EXISTS / ON CONFLICT).
--
-- 1. S6-01 (HIGH): mark_order_payment_status could be called by ANY
--    anonymous caller (the anon key is public by design) and mark any
--    known pending order "paid" — the HMAC check lives only in the
--    webhook route, not in the function. Fix: the function now takes a
--    third argument p_secret and checks it INSIDE the function against
--    a new server_secrets table before doing anything else (fail
--    closed: no stored secret -> "unauthorized"). The old 2-argument
--    function is DROPPED — Postgres allows overloads, so a CREATE
--    without the DROP would leave the vulnerable version callable.
--    The webhook route passes process.env.PAYMENT_WEBHOOK_SECRET as
--    p_secret; in demo-safe mode the route 401s before ever calling
--    the function, so behaviour is unchanged until a real gateway
--    lands. At gateway time the owner stores the SAME secret in the
--    table (see the checklist) and sets PAYMENT_WEBHOOK_SECRET in
--    Vercel to the same value.
-- 2. S6-11 (LOW, partial): lookup_guest_order no longer returns the
--    customer's email or the mobile-banking sender number — neither
--    is rendered on any storefront page (the track/confirmation pages
--    show the TrxID only). The delivery address stays: the track page
--    renders it (app/orders/page.tsx:211), so masking it is an owner
--    UX decision, not a migration change.
-- 3. S6-15 (LOW): re-assert the EXECUTE grants migration 0005
--    promised for the admin RPCs. Live probes showed anon can still
--    invoke every admin function (the in-function is_admin() check
--    holds, so nothing leaked — but the grant layer was not holding).
--    CREATE OR REPLACE preserves grants, so a migration applied
--    before the REVOKE lines existed keeps the old grants; re-running
--    them here corrects the drift.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. server_secrets — server-side secrets readable ONLY by SECURITY
--    DEFINER functions. RLS enabled, ZERO policies: no role (anon,
--    authenticated, or even the table owner via PostgREST) can SELECT
--    it through the API; only functions that run with the definer's
--    rights can read it. One row per secret, keyed by name.
--    (No row for 'payment_webhook_secret' is seeded: in demo-safe mode
--    there is no gateway secret, and an empty table means every call
--    fails closed with "unauthorized".)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.server_secrets (
  key text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.server_secrets ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: deny-by-default for every role.

-- --------------------------------------------------------------------------
-- 2. mark_order_payment_status — 3-argument version with the secret gate.
--    Behaviour, in order:
--      secret missing / not stored / mismatch -> {"ok": false, "error": "unauthorized"}
--        (checked FIRST, so an unauthenticated caller learns nothing
--        about whether the reference exists — the old version leaked a
--        not_found oracle)
--      order not found (reference trimmed) -> {"ok": false, "error": "not_found"}
--      p_status NOT IN ('paid','failed')  -> {"ok": false, "error": "invalid_status"}
--      current payment_status <> 'pending' -> {"ok": false, "error": "invalid_transition"}
--      otherwise: update orders.payment_status AND the latest payments
--      row for that order, and return {"ok": true}.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mark_order_payment_status(text, text);

CREATE OR REPLACE FUNCTION public.mark_order_payment_status(
  p_reference text,
  p_status text,
  p_secret text
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
  -- Secret gate first (S-6, S6-01): the webhook route passes the
  -- server env secret; anyone else gets "unauthorized" and learns
  -- nothing about the order. No stored secret (demo-safe mode) also
  -- fails closed.
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

REVOKE ALL ON FUNCTION public.mark_order_payment_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_payment_status(text, text, text) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. lookup_guest_order — same signature (CREATE OR REPLACE updates it
--    in place), but the returned jsonb no longer carries
--    'customer_email' or 'payment_sender' (S-6, S6-11). The track and
--    confirmation pages render neither; the admin's admin_get_order
--    still returns the sender for the admin area.
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
-- 4. Re-assert admin RPC grants (S-6, S6-15). Idempotent: REVOKE +
--    GRANT of the same grants migration 0005 already declares.
--    (normalize_order_status is a pure helper used by guest functions;
--    its anon grant is untouched.)
-- --------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.am_i_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.am_i_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_orders(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(text, int, int) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_order(text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_customers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_customers() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_revenue_series(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revenue_series(int) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_best_sellers(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_best_sellers(int) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_sales_summary(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sales_summary(int) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_order_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_payment_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_payment_status(text, text) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. VERIFICATION (read-only; the dashboard shows the result grid)
--    Expected after a successful run:
--      server_secrets has RLS enabled and 0 policies;
--      mark_order_payment_status has 3 arguments (the 2-arg version
--      is gone); lookup_guest_order still has 2 arguments.
-- --------------------------------------------------------------------------
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'server_secrets';
-- -- (expect rowsecurity = t)
-- SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'server_secrets';
-- -- (expect 0 rows)
--
-- SELECT proname AS function_name,
--        pg_get_function_arguments(oid) AS arguments
--   FROM pg_proc
--  WHERE proname IN ('mark_order_payment_status', 'lookup_guest_order')
--  ORDER BY proname;
-- -- (expect mark_order_payment_status(text, text, text) and
-- --  lookup_guest_order(text, text))
--
-- -- Anon call with a wrong secret must fail closed (run as anon via
-- -- the REST API, not here): POST /rest/v1/rpc/mark_order_payment_status
-- -- {"p_reference":"RB-2026-000000","p_status":"paid","p_secret":"wrong"}
-- -- -> {"ok":false,"error":"unauthorized"}
