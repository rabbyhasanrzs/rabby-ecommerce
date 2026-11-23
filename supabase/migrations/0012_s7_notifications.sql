-- ==========================================================================
-- 0012 — S-7 order status update emails: notification log (F18, 1.x-4)
-- ==========================================================================
-- Run this in the Supabase SQL Editor on TEST first, then on PRODUCTION
-- — the same pattern as migrations 0001/0003/0004/0005/0006/0007/0008/
-- 0009/0010/0011. Do NOT claim this migration has been run until the
-- owner has run it on a project and the verification queries below
-- have been checked. Re-run safe (CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE).
--
-- What this does:
--   1. notification_log — one row per order-status email attempt
--      (sent / failed / skipped), so the shop can answer "was the
--      customer emailed?" after the Vercel logs expire. Columns:
--      the order reference, the type ('order_status' — the only type
--      in v1), the order status that triggered it, the recipient
--      email (admin-only table — never in console / Vercel logs),
--      the result, a plain-words reason for failed / skipped, and
--      the timestamp.
--   2. log_notification(...) — the SECURITY DEFINER write path for
--      the log. The status route calls it (via the admin client)
--      after every send attempt; it checks is_admin() server-side.
--      A failed log write never fails the status update or the
--      email send — the log call is best-effort in code.
--
-- What this does NOT do: no RLS policies and no table grants
-- (deny-by-default, same as order_status_events in 0003) — no
-- customer-facing read, no anon policy; the only access path is the
-- SECURITY DEFINER function below. No change to orders /
-- order_status_events / admin_update_order_status / admin_get_order;
-- no change to the confirmation email (PR #25); no back-in-stock
-- table (deferred — its own S-7 item, with its own migration);
-- no seed rows.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. notification_log — one row per status-email attempt
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference text NOT NULL,
  type            text NOT NULL CHECK (type IN ('order_status')),
  status          text NOT NULL,
  recipient       text,
  result          text NOT NULL CHECK (result IN ('sent', 'failed', 'skipped')),
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_order_reference
  ON public.notification_log (order_reference);

-- --------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY — deny-by-default, NO POLICIES (see header).
--    Same as order_status_events (0003): no GRANTs and no policies
--    are given to anon or authenticated on this table. The only
--    access path is the SECURITY DEFINER function in section 3,
--    which runs as the table owner and bypasses RLS.
-- --------------------------------------------------------------------------

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 3. log_notification — SECURITY DEFINER write path for the log
--    (admin-only: is_admin() is checked server-side, same as
--    admin_update_order_status in 0005). Callable by authenticated
--    only — the anon key must never write the log.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_notification(
  p_order_reference text,
  p_type text,
  p_status text,
  p_recipient text,
  p_result text,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  INSERT INTO public.notification_log
    (order_reference, type, status, recipient, result, error)
  VALUES (
    btrim(COALESCE(p_order_reference, '')),
    btrim(COALESCE(p_type, '')),
    btrim(COALESCE(p_status, '')),
    NULLIF(btrim(COALESCE(p_recipient, '')), ''),
    btrim(COALESCE(p_result, '')),
    NULLIF(btrim(COALESCE(p_error, '')), '')
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.log_notification(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_notification(text, text, text, text, text, text) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. Verification (run after applying; all on the project where the
--    migration ran — TEST first, then PRODUCTION)
--    * SELECT * FROM public.notification_log;  -- 0 rows (empty until
--      the first status email is attempted).
--    * Anon SELECT on notification_log must still be denied (RLS, no
--      policy — same as order_status_events):
--      -- as anon: SELECT * FROM public.notification_log;
--      -- 0 rows / denied.
--    * As anon, the log function must refuse the write:
--      SELECT * FROM public.log_notification('RB-2026-000000',
--        'order_status', 'confirmed', 'test@example.com', 'sent', NULL);
--      -- {ok:false, error:'forbidden'} and no row appears.
--    * As an admin the same call returns {ok:true} and one row
--      appears in notification_log — delete that test row after:
--      DELETE FROM public.notification_log
--       WHERE order_reference = 'RB-2026-000000';
-- --------------------------------------------------------------------------
