import {
  inventorySaveSchema,
  productSaveSchema,
} from "@/app/admin/(protected)/admin-schemas";
import { describe, expect, it } from "vitest";

function validProduct(): Record<string, unknown> {
  return {
    name: "SAMPLE Round A",
    categoryId: "00000000-0000-4000-8000-000000000001",
    priceBdt: 950,
    stockTotal: 12,
    status: "active",
    description: "Round sunglasses",
    colour: "Black",
    imageUrl: "https://example.supabase.co/photo.webp",
  };
}

/**
 * Admin save-schema bounds (S-6, T-61, S6-08) — pure Zod, no
 * network. admin-schemas.ts is deliberately client-safe (no
 * server-only imports), so it can be tested directly.
 */
describe("productSaveSchema bounds", () => {
  it("accepts a valid product with a Supabase Storage photo URL", () => {
    expect(productSaveSchema.safeParse(validProduct()).success).toBe(true);
  });

  it("accepts the four approved activities (S-7 Shop by Activity)", () => {
    const parsed = productSaveSchema.safeParse({
      ...validProduct(),
      activities: ["driving", "everyday"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.activities).toEqual(["driving", "everyday"]);
    }
  });

  it("defaults activities to [] when omitted (untagged product)", () => {
    const parsed = productSaveSchema.safeParse(validProduct());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.activities).toEqual([]);
    }
  });

  it("rejects an unknown activity slug", () => {
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        activities: ["golf"],
      }).success,
    ).toBe(false);
  });

  it("accepts a same-origin /images/ photo path", () => {
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        imageUrl: "/images/sample-round-a.webp",
      }).success,
    ).toBe(true);
  });

  it("rejects a price above ৳1,000,000", () => {
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        priceBdt: 1000001,
      }).success,
    ).toBe(false);
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        priceBdt: 999999999999,
      }).success,
    ).toBe(false);
  });

  it("accepts a price of exactly ৳1,000,000", () => {
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        priceBdt: 1000000,
      }).success,
    ).toBe(true);
  });

  it("rejects stock above 100,000", () => {
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        stockTotal: 100001,
      }).success,
    ).toBe(false);
  });

  it("rejects an arbitrary external photo URL", () => {
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        imageUrl: "https://example.com/photo.jpg",
      }).success,
    ).toBe(false);
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        imageUrl: "http://example.supabase.co/photo.webp",
      }).success,
    ).toBe(false);
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        imageUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      productSaveSchema.safeParse({
        ...validProduct(),
        imageUrl: "photo.webp",
      }).success,
    ).toBe(false);
  });
});

describe("inventorySaveSchema bounds", () => {
  it("accepts stock within the cap and rejects stock above it", () => {
    expect(
      inventorySaveSchema.safeParse({
        productId: "00000000-0000-4000-8000-000000000001",
        stockTotal: 100000,
      }).success,
    ).toBe(true);
    expect(
      inventorySaveSchema.safeParse({
        productId: "00000000-0000-4000-8000-000000000001",
        stockTotal: 100001,
      }).success,
    ).toBe(false);
  });
});
