import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Hero photo resolution (S-5, §5).
 *
 * The hero photo is a binary the owner uploads via the GitHub web UI
 * (the push-files tool is text-only), so the file may legitimately be
 * absent — at build time, in a fresh checkout, or before the upload.
 * The home hero must look finished without it: resolveHeroPhoto()
 * returns null when no hero file exists, and the hero renders a
 * styled typographic hero with NO <img> tag at all in that case
 * (never a broken-image icon or an error message).
 *
 * Candidates are checked in order; hero.jpg wins when both exist.
 * The `exists` parameter exists so tests can stub the filesystem
 * without mocking node:fs.
 */
const HERO_PHOTO_CANDIDATES = ["hero.jpg", "hero.webp"] as const;

export function resolveHeroPhoto(
  exists: (path: string) => boolean = existsSync,
): string | null {
  for (const file of HERO_PHOTO_CANDIDATES) {
    if (exists(join(process.cwd(), "public", "images", file))) {
      return `/images/${file}`;
    }
  }
  return null;
}
