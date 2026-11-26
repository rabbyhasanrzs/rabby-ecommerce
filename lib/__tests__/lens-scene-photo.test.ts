import { LENS_SCENE_PHOTO_PATH, resolveLensScenePhoto } from "@/lib/lens-scene-photo";
import { describe, expect, it } from "vitest";

describe("resolveLensScenePhoto", () => {
  it("returns /images/lens-scene-beach.jpg when it exists", () => {
    expect(resolveLensScenePhoto(() => true)).toBe(
      "/images/lens-scene-beach.jpg",
    );
    expect(LENS_SCENE_PHOTO_PATH).toBe("/images/lens-scene-beach.jpg");
  });

  it("returns null when the file is absent — the simulator renders nothing, never a broken image", () => {
    expect(resolveLensScenePhoto(() => false)).toBeNull();
  });
});
