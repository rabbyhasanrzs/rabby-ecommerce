import ContentPage from "@/components/content-page";
import FaceShapeGuideContent from "@/components/face-shape-guide-content";
import {
  FACE_SHAPE_GUIDE_EN,
  ROUND_A_MEASUREMENTS,
} from "@/lib/face-shape-guide";
import { getProductBySlug } from "@/lib/supabase/catalog";

/**
 * Face-shape guide (S-5, T-52) — English version.
 *
 * The measurement diagram shows SAMPLE Round A's real measurements
 * from the live catalogue; if the catalogue cannot be read, the
 * seeded values (migration 0001) are used so the page never fails
 * on catalogue availability.
 *
 * Build-safety (same as the PDP, app/product/[slug]/page.tsx): the
 * catalogue read is an uncached Supabase fetch, and with Cache
 * Components enabled (Next 16) `export const dynamic =
 * "force-dynamic"` is not allowed — `export const instant = false`
 * is the build error's own suggested fix for a blocking route, so
 * this page reads at request time instead of prerendering.
 */
export const instant = false;

export default async function FaceShapeGuidePage() {
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
    <ContentPage title={FACE_SHAPE_GUIDE_EN.title} intro={FACE_SHAPE_GUIDE_EN.intro}>
      <FaceShapeGuideContent
        content={FACE_SHAPE_GUIDE_EN}
        measurements={measurements}
        exampleName={exampleName}
      />
    </ContentPage>
  );
}
