import { describe, expect, it } from "vitest";
import { slugifyName } from "@/lib/slugify";

describe("slugifyName", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugifyName("Round Gold")).toBe("round-gold");
  });

  it("collapses runs of separators and trims the ends", () => {
    expect(slugifyName("  Aviator  A  ")).toBe("aviator-a");
    expect(slugifyName("Cat-Eye!")).toBe("cat-eye");
    expect(slugifyName("A/B Test")).toBe("a-b-test");
    expect(slugifyName("Square_Gold")).toBe("square-gold");
    expect(slugifyName("Round   Gold")).toBe("round-gold");
  });

  it("returns an empty slug for separator-only names", () => {
    expect(slugifyName("")).toBe("");
    expect(slugifyName("!!!")).toBe("");
    expect(slugifyName("   ")).toBe("");
  });

  it("treats non-ASCII letters as separators", () => {
    expect(slugifyName("Élégant")).toBe("l-gant");
  });

  it("caps the slug at 80 characters", () => {
    expect(slugifyName("a".repeat(100))).toBe("a".repeat(80));
    // The 80-character cut happens after hyphenation, so a cut that
    // lands on a separator keeps the trailing hyphen (as before).
    expect(slugifyName("a".repeat(79) + "!b")).toBe("a".repeat(79) + "-");
  });
});
