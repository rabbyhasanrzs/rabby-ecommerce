import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Lens scene photo resolution (S-7, 1.x-7, F16).
 *
 * The scene photo is a binary the owner uploads via the GitHub web
 * UI (the push-files tool is text-only), so the file may
 * legitimately be absent — at build time, in a fresh checkout, or
 * before the upload. The lens guide must look finished without it:
 * resolveLensScenePhoto() returns null when the file is absent, and
 * the simulator section renders nothing at all in that case (never
 * a broken-image icon or an error message) — the same pattern as
 * the hero photo (lib/hero-photo.ts).
 *
 * The `exists` parameter exists so tests can stub the filesystem
 * without mocking node:fs.
 */

/** Owner-approved beach scene (Pexels, free for commercial use). */
export const LENS_SCENE_PHOTO_PATH = "/images/lens-scene-beach.jpg";

export function resolveLensScenePhoto(
  exists: (path: string) => boolean = existsSync,
): string | null {
  if (exists(join(process.cwd(), "public", "images", "lens-scene-beach.jpg"))) {
    return LENS_SCENE_PHOTO_PATH;
  }
  return null;
}
