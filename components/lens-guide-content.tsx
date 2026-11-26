import LensSimulator from "@/components/lens-simulator";
import type { LensGuideContent } from "@/lib/lens-guide";
import Link from "next/link";

/**
 * Lens guide sections (S-7, 1.x-7, F16) — shared by the English
 * and Bangla pages. The page passes its language's content object
 * and the resolved scene photo (null until the owner uploads it —
 * the simulator renders nothing in that case, never a placeholder).
 *
 * Mirrors components/face-shape-guide-content.tsx: the other-
 * language link first, the story, the interactive section, then
 * the shop link.
 */
export default function LensGuideContent({
  content,
  scenePhoto,
}: {
  content: LensGuideContent;
  scenePhoto: string | null;
}) {
  return (
    <>
      <p>
        <Link
          href={content.otherLangHref}
          className="font-semibold text-action underline underline-offset-2"
        >
          {content.otherLangLabel}
        </Link>
      </p>

      <section aria-labelledby="lens-story">
        <h2
          id="lens-story"
          className="font-display text-2xl font-bold text-text"
        >
          {content.heading}
        </h2>
        <ul className="mt-4 space-y-6">
          {content.benefits.map((benefit) => (
            <li key={benefit.title}>
              <h3 className="font-display text-xl font-bold text-text">
                {benefit.title}
              </h3>
              <p className="mt-1 leading-relaxed text-text">{benefit.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <LensSimulator content={content} scenePhoto={scenePhoto} />

      <p>
        <Link
          href="/sunglasses"
          className="inline-block min-h-11 rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover"
        >
          {content.shopLinkLabel}
        </Link>
      </p>
    </>
  );
}
