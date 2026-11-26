import ContentPage from "@/components/content-page";
import LensGuideContent from "@/components/lens-guide-content";
import { LENS_GUIDE_EN } from "@/lib/lens-guide";
import { resolveLensScenePhoto } from "@/lib/lens-scene-photo";
import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

/**
 * Lens guide (S-7, 1.x-7, F16) — English version.
 *
 * The copy is the owner-approved draft (2026-11-26) — the RabbY
 * Lens story in plain words, plus a client-side tint-preview
 * simulator on the same page. Fully static: no catalogue read, so
 * this page prerenders (unlike the face-shape guide, which reads
 * the catalogue and needs `export const instant = false`).
 *
 * The scene photo is a binary the owner uploads via the GitHub web
 * UI: resolveLensScenePhoto() checks for it at build time, and the
 * simulator renders only when the file exists in that deployment —
 * the story page is complete without it.
 */
export const metadata: Metadata = pageMetadata("/guide/lens");

export default function LensGuidePage() {
  const scenePhoto = resolveLensScenePhoto();

  return (
    <ContentPage title={LENS_GUIDE_EN.title} intro={LENS_GUIDE_EN.intro}>
      <LensGuideContent content={LENS_GUIDE_EN} scenePhoto={scenePhoto} />
    </ContentPage>
  );
}
