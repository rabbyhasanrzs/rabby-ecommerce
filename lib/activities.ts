import { z } from "zod";

/**
 * Shop by Activity (S-7, 1.x-6, F17) — the docs' four activities.
 *
 * F17 (website-strategy-product-definition.md:228): "Shop by Activity
 * — browse by use (driving, sport, beach, everyday)", "Activity tags
 * per product". The list is fixed: the migration CHECK (0015) freezes
 * the same four slugs, and the admin form offers exactly these four
 * checkboxes. If the owner later wants custom activities, that is a
 * follow-up (a join table + activities admin page), not a quiet edit
 * here — changing this list without the migration CHECK would let
 * the form save values the database rejects.
 *
 * Client-safe: this file imports only Zod, so the admin product
 * form (a client component) and the storefront data layer can both
 * import it. Activities are never derived from product names — the
 * cross-sell rule (§3.2 of the investigation): a mapping must be
 * entered by the owner in admin, never guessed from catalogue text.
 */

/** The four approved activity slugs, in display order. */
export const activitySchema = z.enum([
  "driving",
  "sport",
  "beach",
  "everyday",
]);
export type ActivitySlug = z.infer<typeof activitySchema>;

export const ACTIVITIES: readonly { slug: ActivitySlug; label: string }[] = [
  { slug: "driving", label: "Driving" },
  { slug: "sport", label: "Sport" },
  { slug: "beach", label: "Beach" },
  { slug: "everyday", label: "Everyday" },
];

/** Plain-words label for an activity slug; unknown slugs pass through unchanged. */
export function activityLabel(slug: string): string {
  return ACTIVITIES.find((activity) => activity.slug === slug)?.label ?? slug;
}

/** True iff the value is one of the four approved activity slugs. */
export function isActivitySlug(value: string): value is ActivitySlug {
  return (ACTIVITIES as readonly { slug: string }[]).some(
    (activity) => activity.slug === value,
  );
}
