-- ==========================================================================
-- 0014 — S-7 payment-failed email: notification_log type (F18, 1.x-4)
-- ==========================================================================
-- Run this in the Supabase SQL Editor on TEST first, then on PRODUCTION
-- — the same pattern as migrations 0001/0003/0004/0005/0006/0007/0008/
-- 0009/0010/0011/0012/0013. Do NOT claim this migration has been run
-- until the owner has run it on a project and the verification
-- queries below have been checked. Re-run safe (DROP CONSTRAINT IF
-- EXISTS + conditional ADD).
-- Requires migration 0012 (notification_log) — run 0012 first on any
-- project that does not have it. Run this AFTER 0013 if 0013 has not
-- run yet: 0013 drops and re-adds the same CHECK with only
-- ('order_status', 'back_in_stock'), so a 0013 run after this one
-- would drop 'payment_failed' from the CHECK — re-running this
-- file afterwards restores all three types.
--
-- What this does:
--   1. ALTER notification_log's type CHECK to add 'payment_failed',
--      so every payment-failed email attempt is logged in the one
--      audit table under its own type (not mislabelled as
--      'order_status' — this is not an order-status email).
--
-- What this does NOT do: no change to the order emails
-- (confirmation + status), no change to the payment RPC
-- (failed stays terminal — no failed -> paid correction path in
-- v1), no change to the webhook (disabled in demo mode), no seed
-- rows.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. notification_log — accept the new type. The CHECK was defined
--    inline in 0012, so Postgres named it notification_log_type_check.
--    Re-run safe: DROP ... IF EXISTS, then ADD only when missing.
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
      CHECK (type IN ('order_status', 'back_in_stock', 'payment_failed'));
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 2. Verification (run after applying; all on the project where the
--    migration ran — TEST first, then PRODUCTION)
--    * The CHECK now lists all three types:
--      SELECT pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conname = 'notification_log_type_check';
--      -- CHECK (type IN ('order_status', 'back_in_stock',
--      --   'payment_failed'))
--    * As an admin, the log function accepts the new type:
--      SELECT * FROM public.log_notification('RB-2026-000000',
--        'payment_failed', 'payment_failed', 'test@example.com',
--        'sent', NULL);
--      -- {ok:true} and one row appears in notification_log — delete
--      that test row after:
--      DELETE FROM public.notification_log
--       WHERE order_reference = 'RB-2026-000000';
--    * As anon, the log function must still refuse the write:
--      SELECT * FROM public.log_notification('RB-2026-000000',
--        'payment_failed', 'payment_failed', 'test@example.com',
--        'sent', NULL);
--      -- {ok:false, error:'forbidden'} and no row appears.
-- --------------------------------------------------------------------------
