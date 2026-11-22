import {
  buildProductJsonLd,
  serializeProductJsonLd,
} from "@/lib/product-schema";
import type { ProductDetail } from "@/lib/supabase/catalog";
import { describe, expect, it } from "vitest";

function sampleProduct(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "1",
    slug: "sample-round-a",
    name: "SAMPLE Round A",
    description: "Round sunglasses",
    category_id: "c1",
    category_slug: "women",
    category_name: "Women",
    price_bdt: 950,
    stock_total: 12,
    is_demo: true,
    created_at: "2026-11-18T00:00:00Z",
    primary_image: "/images/sample-round-a.webp",
    variants: [
      {
        id: "v1",
        colour: "Black",
        price_bdt: null,
        stock_quantity: null,
        sort_order: 0,
      },
    ],
    images: [
      {
        id: "i1",
        storage_path: "/images/sample-round-a.webp",
        alt_text: "SAMPLE Round A",
        sort_order: 0,
        is_primary: true,
      },
    ],
    measurements: null,
    ...overrides,
  };
}

describe("serializeProductJsonLd (S-6, T-61, S6-02)", () => {
  it("serializes to the same JSON as buildProductJsonLd for a normal product", () => {
    const product = sampleProduct();
    expect(JSON.parse(serializeProductJsonLd(product))).toEqual(
      buildProductJsonLd(product),
    );
  });

  it("escapes a </script> payload in the product name so it cannot break out of the JSON-LD block", () => {
    const product = sampleProduct({
      name: 'SAMPLE Round A</script><script>alert("xss")</script>',
      description: "Round sunglasses",
    });
    const serialized = serializeProductJsonLd(product);
    // No literal closing script tag may survive — the escaped form
    // is \u003c/script\u003e, which JSON.parse decodes back.
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
    expect(serialized).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(serialized).name).toBe(product.name);
  });

  it("escapes a </script> payload in the product description", () => {
    const product = sampleProduct({
      description: 'Nice frames</script><script>alert("xss")</script>',
    });
    const serialized = serializeProductJsonLd(product);
    expect(serialized).not.toContain("</script>");
    expect(JSON.parse(serialized).description).toBe(product.description);
  });

  it("escapes <, > and & while keeping the parsed JSON identical", () => {
    const product = sampleProduct({
      name: "A & B <C> D",
      description: "x < y & z > w",
    });
    const serialized = serializeProductJsonLd(product);
    expect(serialized).not.toContain("A & B");
    expect(JSON.parse(serialized)).toEqual(buildProductJsonLd(product));
  });
});
