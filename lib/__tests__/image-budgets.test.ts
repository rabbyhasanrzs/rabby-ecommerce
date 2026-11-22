import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Image budgets — S-5, T-56 (Phase 08 §9.1 / NFR-03).
 *
 * Product images ≤ 300 KB, hero ≤ 500 KB. The hero photo is uploaded
 * by the owner AFTER merge, so the hero assertion is skipped — never
 * failed — while the file is absent. public/images/ itself does not
 * exist yet either (no product photos are in the repo); an empty
 * folder is a vacuous pass, not a failure.
 */

const IMAGES_DIR = join(process.cwd(), "public", "images");

const PRODUCT_IMAGE_MAX_BYTES = 300 * 1024;
const HERO_MAX_BYTES = 500 * 1024;

function imageFiles(): string[] {
  if (!existsSync(IMAGES_DIR)) {
    return [];
  }
  return readdirSync(IMAGES_DIR).filter((name) => {
    const full = `${IMAGES_DIR}/${name}`;
    return statSync(full).isFile();
  });
}

function isHero(name: string): boolean {
  return name === "hero.jpg" || name === "hero.webp";
}

const heroPresent = imageFiles().some(isHero);

describe("image budgets", () => {
  it("every product image is ≤ 300 KB", () => {
    const products = imageFiles().filter((name) => !isHero(name));
    for (const name of products) {
      const size = statSync(`${IMAGES_DIR}/${name}`).size;
      expect(
        size,
        `${name} is ${size} bytes — over the 300 KB product budget`,
      ).toBeLessThanOrEqual(PRODUCT_IMAGE_MAX_BYTES);
    }
  });

  it.skipIf(!heroPresent)(
    "the hero image is ≤ 500 KB (skipped until the owner uploads it)",
    () => {
      const hero = imageFiles().find(isHero);
      expect(hero).toBeDefined();
      const size = statSync(`${IMAGES_DIR}/${hero}`).size;
      expect(
        size,
        `${hero} is ${size} bytes — over the 500 KB hero budget`,
      ).toBeLessThanOrEqual(HERO_MAX_BYTES);
    },
  );

  it("no image filename contains a space (og:image URLs must not)", () => {
    for (const name of imageFiles()) {
      expect(name).not.toContain(" ");
    }
  });
});
