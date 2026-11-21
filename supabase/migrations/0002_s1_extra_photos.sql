-- ============================================================================
-- Rabby e-commerce — S-1 extra product photos (gallery demo)
-- File: supabase/migrations/0002_s1_extra_photos.sql
-- Project: rabby-ecommerce-test (Supabase, Singapore, Free)
-- Date: 2026-11-22
--
-- HOW TO APPLY (owner / browser session):
--   Supabase Dashboard -> project rabby-ecommerce-test -> SQL Editor
--   -> New query -> paste this WHOLE file -> Run.
--   It is safe to re-run: each insert is guarded by NOT EXISTS on
--   (product_id, storage_path) — product_images has no unique constraint
--   on that pair, so ON CONFLICT cannot guard it (same pattern as the
--   image seed in 0001_s1_catalogue.sql).
--
-- SCOPE: two extra product_images rows for sample-round-a ONLY, so its
-- PDP gallery is demonstrable live (3 photos: primary + 2 extra angles).
-- No table, policy, or other product changes. The photo FILES themselves
-- are NOT in this migration (binaries cannot travel in SQL) — they must
-- be uploaded to the repo at public/images/ first (see
-- s-1-extra-photos-owner-checklist.md). The gallery shows multiple
-- photos only after BOTH steps (files uploaded + this SQL run).
--
-- PHOTOS (Pexels License, free for commercial use; provenance:
-- demo-asset-sources.md):
--   sample-round-b.webp — "Close Up Shot of a Sunglass", Vita Leonis
--     https://www.pexels.com/photo/close-up-shot-of-a-sunglass-7822912/
--     Round sunglasses, side view on a polished wooden surface.
--   sample-round-c.webp — "Black Framed Hippie Sunglasses",
--     Felipe Ferreira
--     https://www.pexels.com/photo/black-framed-hippie-sunglasses-701877/
--     Round sunglasses with blue-green lenses, gold frames, front view.
-- ============================================================================

INSERT INTO public.product_images
  (product_id, storage_path, alt_text, sort_order, is_primary)
SELECT p.id,
  '/images/sample-round-b.webp',
  'SAMPLE Round A — round sunglasses, side view on a wooden surface',
  2, false
FROM public.products p
WHERE p.slug = 'sample-round-a'
AND NOT EXISTS (
  SELECT 1 FROM public.product_images pi
  WHERE pi.product_id = p.id
    AND pi.storage_path = '/images/sample-round-b.webp'
);

INSERT INTO public.product_images
  (product_id, storage_path, alt_text, sort_order, is_primary)
SELECT p.id,
  '/images/sample-round-c.webp',
  'SAMPLE Round A — round sunglasses with blue-green lenses, front view',
  3, false
FROM public.products p
WHERE p.slug = 'sample-round-a'
AND NOT EXISTS (
  SELECT 1 FROM public.product_images pi
  WHERE pi.product_id = p.id
    AND pi.storage_path = '/images/sample-round-c.webp'
);

-- --------------------------------------------------------------------------
-- VERIFICATION (read-only; the dashboard shows the result grid)
--    Expected after a successful run:
--      images_for_sample_round_a = 3
--      sample-round-a rows: sort_order 1 (primary), 2, 3
-- --------------------------------------------------------------------------
SELECT count(*) AS images_for_sample_round_a
FROM public.product_images pi
JOIN public.products p ON p.id = pi.product_id
WHERE p.slug = 'sample-round-a';

SELECT pi.storage_path, pi.alt_text, pi.sort_order, pi.is_primary
FROM public.product_images pi
JOIN public.products p ON p.id = pi.product_id
WHERE p.slug = 'sample-round-a'
ORDER BY pi.sort_order;
