import ContentPage from "@/components/content-page";
import LensGuideContent from "@/components/lens-guide-content";
import { LENS_GUIDE_BN } from "@/lib/lens-guide";
import { resolveLensScenePhoto } from "@/lib/lens-scene-photo";
import { notoSansBengali } from "@/lib/fonts";
import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

/**
 * Lens guide (S-7, 1.x-7, F16) — Bangla version.
 *
 * Unique Bengali title + description + canonical (the /guide
 * layout's metadata is the English face-shape guide's). Bengali
 * typeface via the same next/font/google pattern the site uses for
 * Inter + Playfair Display: Noto Sans Bengali, loaded in
 * lib/fonts.ts and applied with its className on this page's
 * wrapper (app/layout.tsx is untouched).
 *
 * The approved Bangla copy is the draft's Romanized Bangla,
 * exactly as approved — Latin script, covered by the "latin"
 * subset, like product names and mm figures on the face-shape
 * guide's Bangla page.
 *
 * Fully static, like the English page: no catalogue read, so this
 * page prerenders. The simulator renders only when the scene
 * photo exists in the deployment.
 */
export const metadata: Metadata = pageMetadata("/guide/lens/bn");

export default function LensGuideBnPage() {
  const scenePhoto = resolveLensScenePhoto();

  return (
    <div lang="bn" className={notoSansBengali.className}>
      <ContentPage title={LENS_GUIDE_BN.title} intro={LENS_GUIDE_BN.intro}>
        <LensGuideContent content={LENS_GUIDE_BN} scenePhoto={scenePhoto} />
      </ContentPage>
    </div>
  );
}
