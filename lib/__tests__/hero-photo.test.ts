import { resolveHeroPhoto } from "@/lib/hero-photo";
import { describe, expect, it } from "vitest";

describe("resolveHeroPhoto", () => {
  it("returns /images/hero.jpg when it exists", () => {
    expect(resolveHeroPhoto(() => true)).toBe("/images/hero.jpg");
  });

  it("falls back to /images/hero.webp when only it exists", () => {
    const exists = (path: string) => path.endsWith("hero.webp");
    expect(resolveHeroPhoto(exists)).toBe("/images/hero.webp");
  });

  it("returns null when no hero file exists — the hero must render with no <img> at all", () => {
    expect(resolveHeroPhoto(() => false)).toBeNull();
  });
});
