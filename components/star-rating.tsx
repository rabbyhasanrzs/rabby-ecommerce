"use client";

import { StarIcon } from "@/components/icons";
import { useState } from "react";

/**
 * Star rating — S-7, T-70 (reviews).
 *
 * Stars are inline SVG (the repo has no icon library); never emoji.
 * Filled stars use the palette's amber (text-warning); empty stars
 * use the champagne border tone. Two modes:
 *
 *   StarsDisplay — read-only, fractional fill (the gold row is
 *     clipped to average/5) with a plain-words aria-label. The
 *     average is display-only, one decimal, computed by the
 *     database — never stored, never invented.
 *   StarsInput — an accessible radio group (keyboard operable,
 *     44px targets, visible focus ring). A value of 0 means "not
 *     rated yet" (used for the optional Quality / Value / Fit
 *     sub-ratings).
 */

export function StarRow({
  filledCount,
  className,
}: {
  filledCount: number;
  className?: string;
}) {
  return (
    <span className={`flex shrink-0 ${className ?? ""}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          filled={star <= filledCount}
          className="h-5 w-5"
        />
      ))}
    </span>
  );
}

/** Read-only stars for an average (fractional fill via clipping). */
export function StarsDisplay({
  average,
  count,
  className,
}: {
  average: number;
  /** When given, the label reads "…based on N reviews". */
  count?: number;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, (average / 5) * 100));
  const label =
    count === undefined
      ? `Rated ${average.toFixed(1)} out of 5 stars`
      : `Rated ${average.toFixed(1)} out of 5 stars, based on ${count} review${count === 1 ? "" : "s"}`;
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex items-center ${className ?? ""}`}
    >
      <span className="relative inline-flex">
        <StarRow filledCount={0} className="text-border-strong" />
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        >
          <StarRow filledCount={5} className="text-warning" />
        </span>
      </span>
    </span>
  );
}

/**
 * Star picker — a radio group, so keyboard users tab to the group
 * and arrow between stars, and screen readers hear "3 stars" etc.
 * `value` 0 = nothing chosen yet. Hover previews the star under
 * the cursor without committing it.
 */
export function StarsInput({
  id,
  label,
  value,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  required?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset onMouseLeave={() => setHover(0)}>
      <legend className="mb-1 block text-sm font-semibold text-text">
        {label}
        {required ? (
          <span aria-hidden="true"> *</span>
        ) : (
          <span className="font-normal text-text-secondary"> (optional)</span>
        )}
      </legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            onMouseEnter={() => setHover(star)}
            className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md"
          >
            <input
              type="radio"
              name={id}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
              className="peer sr-only"
            />
            <span className="rounded-md peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
              <StarIcon
                filled={star <= shown}
                className={`h-8 w-8 ${star <= shown ? "text-warning" : "text-text-secondary"}`}
              />
            </span>
          </label>
        ))}
      </div>
      {required && value === 0 ? (
        <p className="mt-1 text-sm text-text-secondary">
          Choose 1 to 5 stars.
        </p>
      ) : null}
    </fieldset>
  );
}
