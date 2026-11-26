"use client";

import type { LensGuideContent } from "@/lib/lens-guide";
import Image from "next/image";
import { useState } from "react";

/**
 * Lens simulator (S-7, 1.x-7, F16) — a client-side lens-colour
 * preview, not a virtual try-on (F21, Future, explicitly not part
 * of this feature).
 *
 * The approved beach scene photo is shown once; the tint buttons
 * preview it through each demo tint — a CSS colour overlay with a
 * multiply blend, the same client-component + useState pattern the
 * site already uses for interactive elements. No backend, no
 * migration, no purchase gating: the simulator is education on a
 * guide page and never touches Add to Bag.
 *
 * The scene photo is a binary the owner uploads via the GitHub web
 * UI, so it may legitimately be absent (before the upload, or in a
 * fresh checkout): when scenePhoto is null this component renders
 * nothing at all — no placeholder simulator, no broken image.
 */
export default function LensSimulator({
  content,
  scenePhoto,
}: {
  content: LensGuideContent;
  scenePhoto: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (scenePhoto === null) {
    return null;
  }

  const selected = content.tints.find((tint) => tint.id === selectedId) ?? null;

  return (
    <section aria-labelledby="lens-simulator">
      <h2
        id="lens-simulator"
        className="font-display text-2xl font-bold text-text"
      >
        {content.simulatorTitle}
      </h2>
      <p className="mt-3 leading-relaxed text-text">
        {content.simulatorIntro}
      </p>

      <div className="relative mt-4 aspect-[3/2] w-full overflow-hidden rounded-lg border border-border bg-background-subtle">
        <Image
          src={scenePhoto}
          alt="Bright tropical beach scene — white sand, turquoise water, palm trees"
          fill
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
        {selected ? (
          <div
            aria-hidden="true"
            data-testid="lens-tint-overlay"
            className="absolute inset-0"
            style={{
              backgroundColor: selected.overlay,
              mixBlendMode: "multiply",
            }}
          />
        ) : null}
      </div>

      <div
        role="group"
        aria-label={content.simulatorTitle}
        className="mt-4 flex flex-wrap gap-2"
      >
        <button
          type="button"
          aria-pressed={selected === null}
          onClick={() => setSelectedId(null)}
          className={`min-h-11 rounded-md border px-4 py-2 text-base font-semibold transition-colors ${
            selected === null
              ? "border-action bg-action text-text-inverse"
              : "border-border text-text hover:border-action hover:text-action"
          }`}
        >
          {content.clearLabel}
        </button>
        {content.tints.map((tint) => (
          <button
            key={tint.id}
            type="button"
            aria-pressed={selected?.id === tint.id}
            onClick={() => setSelectedId(tint.id)}
            className={`min-h-11 rounded-md border px-4 py-2 text-base font-semibold transition-colors ${
              selected?.id === tint.id
                ? "border-action bg-action text-text-inverse"
                : "border-border text-text hover:border-action hover:text-action"
            }`}
          >
            {tint.name}
          </button>
        ))}
      </div>

      {selected ? (
        <p className="mt-3 leading-relaxed text-text">{selected.caption}</p>
      ) : null}
      <p className="mt-3 leading-relaxed text-text-secondary">
        {content.simulatorDemoNote}
      </p>
    </section>
  );
}
