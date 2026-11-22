import FaceShapeIcon from "@/components/face-shape-icon";
import MeasurementDiagram from "@/components/measurement-diagram";
import type { FaceShapeGuideContent } from "@/lib/face-shape-guide";
import type { ProductMeasurements } from "@/lib/supabase/catalog";
import Link from "next/link";

/**
 * Face-shape guide sections (S-5, T-52) — shared by the English and
 * Bangla pages. The page passes its language's content object; the
 * measurements come from the live catalogue (SAMPLE Round A) with
 * the seeded values as fallback in the page.
 *
 * The measurement diagram is the real product's diagram, not a
 * generic drawing: its labels carry the product's own numbers.
 */
export default function FaceShapeGuideContent({
  content,
  measurements,
  exampleName,
}: {
  content: FaceShapeGuideContent;
  measurements: ProductMeasurements | null;
  exampleName: string;
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

      <section aria-labelledby="how-to-tell">
        <h2
          id="how-to-tell"
          className="font-display text-2xl font-bold text-text"
        >
          {content.howToTitle}
        </h2>
        <p className="mt-3 leading-relaxed text-text">{content.howToBody}</p>
      </section>

      {content.shapes.map((shape) => (
        <section key={shape.id} aria-labelledby={`shape-${shape.id}`}>
          <div className="flex items-center gap-3">
            <FaceShapeIcon
              shape={shape.id}
              className="h-12 w-12 text-action"
            />
            <h2
              id={`shape-${shape.id}`}
              className="font-display text-2xl font-bold text-text"
            >
              {shape.name}
            </h2>
          </div>
          <p className="mt-3 leading-relaxed text-text">{shape.features}</p>
          <p className="mt-2 leading-relaxed text-text">
            {shape.recommended}
          </p>
          {shape.catalogueBest ? (
            <p className="mt-2 leading-relaxed text-text-secondary">
              {content.catalogueNote} {shape.catalogueBest.join(", ")}.
            </p>
          ) : (
            <p className="mt-2 leading-relaxed text-text-secondary">
              {content.oblongNote}
            </p>
          )}
        </section>
      ))}

      <section aria-labelledby="size-in-mm">
        <h2
          id="size-in-mm"
          className="font-display text-2xl font-bold text-text"
        >
          {content.sizeTitle}
        </h2>
        <p className="mt-3 leading-relaxed text-text">{content.sizeIntro}</p>
        <table className="mt-4 w-full border-collapse text-left text-text">
          <caption className="sr-only">{content.sizeTitle}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-4 font-semibold">
                {content.bandHeader}
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                {content.frameWidthHeader}
              </th>
              <th scope="col" className="py-2 font-semibold">
                {content.framesHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {content.bands.map((band) => (
              <tr key={band.name} className="border-b border-border">
                <th scope="row" className="py-2 pr-4 font-semibold">
                  {band.name}
                </th>
                <td className="py-2 pr-4">{band.frameWidth}</td>
                <td className="py-2">{band.products}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-4 space-y-1 text-text">
          {content.sizeRanges.map((range) => (
            <li key={range.label}>
              {range.label}: {range.value}
            </li>
          ))}
        </ul>
        <p className="mt-3 leading-relaxed text-text-secondary">
          {content.sizeNote}
        </p>
        <p className="mt-4 font-semibold text-text">
          {content.exampleLabel} — {exampleName}:
        </p>
        <div className="mt-2">
          <MeasurementDiagram measurements={measurements} />
        </div>
      </section>

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
