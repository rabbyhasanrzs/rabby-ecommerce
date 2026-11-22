import ContentPage from "@/components/content-page";
import FaceShapeGuideContent from "@/components/face-shape-guide-content";
import {
  FACE_SHAPE_GUIDE_BN,
  ROUND_A_MEASUREMENTS,
} from "@/lib/face-shape-guide";
import { notoSansBengali } from "@/lib/fonts";
import { pageMetadata } from "@/lib/seo";
import { getProductBySlug } from "@/lib/supabase/catalog";
import type { Metadata } from "next";

/** S-5, T-57: the Bangla guide is its own page — unique Bengali title + description + canonical (the /guide layout's metadata is the English guide's). */
export const metadata: Metadata = pageMetadata("/guide/face-shape/bn");

/**
 * Face-shape guide (S-5, T-52) — Bangla version.
 *
 * Bengali typeface via the same next/font/google pattern the site
 * uses for Inter + Playfair Display: Noto Sans Bengali, loaded in
 * lib/fonts.ts and applied with its className on this page's
 * wrapper (app/layout.tsx is untouched). Product names and mm
 * figures stay in Latin script, covered by the "latin" subset.
 * Measurements come from the live catalogue (SAMPLE Round A) with
 * the seeded values as fallback, same as the English page.
 *
 * Build-safety: same as the English guide — the catalogue read is an
 * uncached Supabase fetch, so `export const instant = false` (the
 * Cache Components replacement for force-dynamic) makes this page
 * read at request time instead of prerendering.
 */
export const instant = false;

export default async function FaceShapeGuideBnPage() {
  let measurements = ROUND_A_MEASUREMENTS;
  let exampleName = "SAMPLE Round A";
  try {
    const product = await getProductBySlug("sample-round-a");
    if (product?.measurements) {
      measurements = product.measurements;
      exampleName = product.name;
    }
  } catch {
    // Catalogue unavailable — the seeded values stay in use.
  }

  return (
    <div lang="bn" className={notoSansBengali.className}>
      <ContentPage title={FACE_SHAPE_GUIDE_BN.title} intro={FACE_SHAPE_GUIDE_BN.intro}>
        <FaceShapeGuideContent
          content={FACE_SHAPE_GUIDE_BN}
          measurements={measurements}
          exampleName={exampleName}
        />
      </ContentPage>
    </div>
  );
}
