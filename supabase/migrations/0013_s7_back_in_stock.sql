-- ==========================================================================
-- 0013 — S-7 back-in-stock alerts: subscriptions + trigger
-- ==========================================================================
-- Run this in the Supabase SQL Editor on TEST first, then on PRODUCTION
-- — the same pattern as migrations 0001/0003/0004/0005/0006/0007/0008/
-- 0009/0010/0011/0012. Do NOT claim this migration has been run until the
-- owner has run it on a project and the verification queries below
-- have been checked. Re-run safe (CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE, DROP CONSTRAINT IF EXISTS + conditional ADD).
-- Requires migration 0012 (notification_log) — section 4 extends its
-- type CHECK; run 0012 first on any project that does not have it.
--
-- This feature has NO documented scope: back-in-stock alerts appear
-- nowhere in the approved docs (no FR, no 1.x slot). It is an
-- owner-approved standard setup — see the S-7 back-in-stock
-- investigation note (~/workspace/your_files/
-- s-7-back-in-stock-investigation.md). Email only, PDP only,
-- product-level, one alert per subscription then consumed, trigger
-- is the admin inventory save (0 -> >0) only.
--
-- What this does:
--   1. stock_alert_subscriptions — one row per "tell me when this is
--      back in stock" request: the product, the subscriber email
--      (one purpose only), the lifecycle (pending -> sent, or
--      pending -> unsubscribed), a per-row unsubscribe token, and
--      timestamps. One pending row per email + product (unique
--      partial index) — a second subscribe is a no-op that returns
--      the same success message, never a second row and never a
--      leak that the email is already subscribed.
--   2. Four SECURITY DEFINER functions: subscribe_stock_alert
--      (public), list_stock_alert_subscriptions (admin-only),
--      mark_stock_alerts_sent (admin-only, atomic claim),
--      unsubscribe_stock_alert (public, token is the secret).
--      RLS deny-by-default, no policies, no table grants — same as
--      notification_log (0012) and order_status_events (0003).
--   3. ALTER notification_log's type CHECK to add 'back_in_stock',
--      so every alert attempt is logged in the one audit table.
--
-- What this does NOT do: no change to the order emails
-- (confirmation + status), no change to the cancel route (a
-- cancellation restoring stock does NOT trigger an alert in v1 —
-- known gap, owner decision), no per-variant alerts (stock is
-- product-level), no marketing mail, no seed rows.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. stock_alert_subscriptions — one row per alert request
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_alert_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  email             text NOT NULL,
  status            text NOT NULL CHECK (status IN ('pending', 'sent', 'unsubscribed')) DEFAULT 'pending',
  unsubscribe_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz NULL
);

-- One pending row per email + product. A second subscribe while one
-- is pending is a no-op (ON CONFLICT DO NOTHING in the function) —
-- never a second row, never a leak that the email is subscribed.
-- After a row is 'sent', a new subscription is allowed again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_alert_subscriptions_pending
  ON public.stock_alert_subscriptions (product_id, lower(email))
  WHERE status = 'pending';

-- --------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY — deny-by-default, NO POLICIES (see header).
--    Same as notification_log (0012) and order_status_events (0003):
--    no GRANTs and no policies are given to anon or authenticated
--    on this table. The only access paths are the SECURITY DEFINER
--    functions in section 3, which run as the table owner and
--    bypass RLS.
-- --------------------------------------------------------------------------

ALTER TABLE public.stock_alert_subscriptions ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 3. SECURITY DEFINER functions
-- --------------------------------------------------------------------------

-- Subscribe to a back-in-stock alert (public — called by the PDP
-- form through the anon client). Validates the slug exists, the
-- product is active AND out of stock, and the email shape; then
-- inserts, or no-ops on the dedupe. Returns {ok:true} in both the
-- insert and the already-subscribed case — the route answers both
-- with one shared message, so no caller can probe whether an email
-- is on the list. The unsubscribe token is never returned here.
CREATE OR REPLACE FUNCTION public.subscribe_stock_alert(
  p_product_slug text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_product record;
BEGIN
  IF v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  SELECT id, stock_total, status INTO v_product
  FROM public.products
  WHERE slug = btrim(COALESCE(p_product_slug, ''));

  IF v_product IS NULL OR v_product.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;

  IF v_product.stock_total > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_in_stock');
  END IF;

  INSERT INTO public.stock_alert_subscriptions (product_id, email)
  VALUES (v_product.id, v_email)
  ON CONFLICT (product_id, lower(email)) WHERE status = 'pending'
  DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_stock_alert(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_stock_alert(text, text) TO anon, authenticated;

-- List subscriptions (admin-only — is_admin() checked server-side,
-- same as the admin_* RPCs in 0005). Returns a jsonb array of rows
-- (newest first, capped at 500), each with the product slug + name,
-- or {ok:false, error:'forbidden'} for a non-admin. Filters are
-- optional: NULL means "all".
CREATE OR REPLACE FUNCTION public.list_stock_alert_subscriptions(
  p_product_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT s.id, s.product_id, p.slug AS product_slug,
           p.name AS product_name, s.email, s.status,
           s.created_at, s.sent_at
    FROM public.stock_alert_subscriptions s
    JOIN public.products p ON p.id = s.product_id
    WHERE (p_product_id IS NULL OR s.product_id = p_product_id)
      AND (p_status IS NULL OR s.status = p_status)
    ORDER BY s.created_at DESC
    LIMIT 500
  ) t;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.list_stock_alert_subscriptions(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_stock_alert_subscriptions(uuid, text) TO authenticated;

-- Atomically claim pending subscriptions for sending (admin-only).
-- Flips the given rows from 'pending' to 'sent' (with sent_at) and
-- returns the claimed rows (id, email, unsubscribe_token) — only
-- rows that were still 'pending' come back, so two quick saves (or
-- two server instances) can never email the same person twice. The
-- trigger calls this BEFORE sending: a failed send is logged in
-- notification_log, and the customer can re-subscribe.
CREATE OR REPLACE FUNCTION public.mark_stock_alerts_sent(
  p_product_id uuid,
  p_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  WITH claimed AS (
    UPDATE public.stock_alert_subscriptions
    SET status = 'sent', sent_at = now()
    WHERE product_id = p_product_id
      AND id = ANY(p_ids)
      AND status = 'pending'
    RETURNING id, email, unsubscribe_token
  )
  SELECT COALESCE(jsonb_agg(row_to_json(claimed)), '[]'::jsonb)
  INTO v_rows FROM claimed;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stock_alerts_sent(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_stock_alerts_sent(uuid, uuid[]) TO authenticated;

-- Unsubscribe (public — the per-row token IS the secret, no auth).
-- Marks a pending row 'unsubscribed'. Returns {ok:true} whether or
-- not a row matched, so the route shows one confirmation either
-- way — a bad token reveals nothing.
CREATE OR REPLACE FUNCTION public.unsubscribe_stock_alert(
  p_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.stock_alert_subscriptions
  SET status = 'unsubscribed'
  WHERE unsubscribe_token = p_token
    AND status = 'pending';

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.unsubscribe_stock_alert(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_stock_alert(uuid) TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 4. notification_log — accept the new type (section 3.4a of the
--    investigation note). The CHECK was defined inline in 0012, so
--    Postgres named it notification_log_type_check. Re-run safe:
--    DROP ... IF EXISTS, then ADD only when missing.
-- --------------------------------------------------------------------------

ALTER TABLE public.notification_log
  DROP CONSTRAINT IF EXISTS notification_log_type_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_log_type_check'
      AND conrelid = 'public.notification_log'::regclass
  ) THEN
    ALTER TABLE public.notification_log
      ADD CONSTRAINT notification_log_type_check
      CHECK (type IN ('order_status', 'back_in_stock'));
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 5. Verification (run after applying; all on the project where the
--    migration ran — TEST first, then PRODUCTION)
--    * SELECT * FROM public.stock_alert_subscriptions;  -- 0 rows.
--    * As anon, subscribe to the out-of-stock product:
--      SELECT * FROM public.subscribe_stock_alert('sample-futuristic', 'test@example.com');
--      -- {ok:true} and one row appears (status 'pending').
--    * Same call again: {ok:true}, still one row (dedupe).
--    * SELECT * FROM public.subscribe_stock_alert('sample-futuristic', 'not-an-email');
--      -- {ok:false, error:'invalid_email'}.
--    * SELECT * FROM public.subscribe_stock_alert('sample-round-a', 'test@example.com');
--      -- {ok:false, error:'product_in_stock'} (Round is in stock).
--    * As anon, the list must refuse:
--      SELECT * FROM public.list_stock_alert_subscriptions(NULL, NULL);
--      -- {ok:false, error:'forbidden'}.
--    * notification_log accepts the new type (checked by the first
--      logged attempt in the staging test).
--    * Clean up the test row after:
--      DELETE FROM public.stock_alert_subscriptions WHERE email = 'test@example.com';
-- --------------------------------------------------------------------------
