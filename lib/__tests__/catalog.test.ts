import { formatPriceBdt, stockLabel } from "@/lib/format";
import {
  applyListingFilters,
  CatalogueUnavailableError,
  faceShapeChipLabel,
  getProductBySlug,
  isValidSlug,
  listProducts,
  parseListingParams,
  sortProducts,
  type ListingParams,
  type ProductSummary,
} from "@/lib/supabase/catalog";
import { getSupabaseClient } from "@/lib/supabase/client";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: vi.fn(),
}));

const mockedGetClient = vi.mocked(getSupabaseClient);

beforeEach(() => {
  mockedGetClient.mockClear();
});

function sampleProducts(): ProductSummary[] {
  return [
    {
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
    },
    {
      id: "2",
      slug: "sample-aviator-a",
      name: "SAMPLE Aviator A",
      description: "Aviator sunglasses",
      category_id: "c2",
      category_slug: "men",
      category_name: "Men",
      price_bdt: 1450,
      stock_total: 8,
      is_demo: true,
      created_at: "2026-11-19T00:00:00Z",
      primary_image: "/images/sample-aviator-a.webp",
    },
    {
      id: "3",
      slug: "sample-futuristic-a",
      name: "SAMPLE Futuristic A",
      description: "Futuristic sunglasses",
      category_id: "c2",
      category_slug: "men",
      category_name: "Men",
      price_bdt: 3200,
      stock_total: 0,
      is_demo: true,
      created_at: "2026-11-20T00:00:00Z",
      primary_image: "/images/sample-futuristic-a.webp",
    },
  ];
}

const baseParams: ListingParams = {
  search: "",
  category: "",
  sort: "featured",
  inStockOnly: false,
};

// ---------------------------------------------------------------------------
// Slug allowlist (audit G-M4)
// ---------------------------------------------------------------------------

describe("isValidSlug", () => {
  it("accepts lowercase letters, digits, and hyphens", () => {
    expect(isValidSlug("sample-round-a")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("abc-123-def")).toBe(true);
  });

  it("rejects uppercase, underscores, spaces, slashes, and empty slugs", () => {
    expect(isValidSlug("Sample-Round-A")).toBe(false);
    expect(isValidSlug("sample_round_a")).toBe(false);
    expect(isValidSlug("sample round")).toBe(false);
    expect(isValidSlug("sample/round")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("../etc")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Price formatting (integer BDT only)
// ---------------------------------------------------------------------------

describe("formatPriceBdt", () => {
  it("formats integer Taka with ৳ and en-IN grouping, no decimals", () => {
    expect(formatPriceBdt(950)).toBe("৳950");
    expect(formatPriceBdt(3200)).toBe("৳3,200");
    expect(formatPriceBdt(100000)).toBe("৳1,00,000");
    expect(formatPriceBdt(0)).toBe("৳0");
  });

  it("never produces USD or a decimal price", () => {
    expect(formatPriceBdt(1450)).not.toContain("$");
    expect(formatPriceBdt(1450)).not.toContain(".");
  });

  it("rejects non-integer and negative prices", () => {
    expect(() => formatPriceBdt(19.99)).toThrow();
    expect(() => formatPriceBdt(-5)).toThrow();
  });
});

describe("stockLabel", () => {
  it("states stock in plain words", () => {
    expect(stockLabel(0)).toBe("Out of Stock");
    expect(stockLabel(1)).toBe("Only 1 left in stock");
    expect(stockLabel(2)).toBe("Only 2 left in stock");
    expect(stockLabel(12)).toBe("In Stock");
  });
});

// ---------------------------------------------------------------------------
// Listing params parsing
// ---------------------------------------------------------------------------

describe("parseListingParams", () => {
  it("defaults to featured sort with no filters", () => {
    expect(parseListingParams({})).toEqual({
      search: "",
      category: "",
      sort: "featured",
      inStockOnly: false,
    });
  });

  it("parses search, category, sort, prices, and in-stock toggle", () => {
    const parsed = parseListingParams({
      search: "aviator",
      category: "men",
      sort: "price-asc",
      priceMin: "1000",
      priceMax: "2000",
      inStockOnly: "true",
    });
    expect(parsed.search).toBe("aviator");
    expect(parsed.category).toBe("men");
    expect(parsed.sort).toBe("price-asc");
    expect(parsed.priceMin).toBe(1000);
    expect(parsed.priceMax).toBe(2000);
    expect(parsed.inStockOnly).toBe(true);
  });

  it("falls back to safe defaults on invalid values", () => {
    const parsed = parseListingParams({ sort: "cheapest", category: "BAD SLUG" });
    expect(parsed.sort).toBe("featured");
    expect(parsed.category).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Filter / sort logic
// ---------------------------------------------------------------------------

describe("applyListingFilters", () => {
  it("filters by category", () => {
    const out = applyListingFilters(sampleProducts(), {
      ...baseParams,
      category: "men",
    });
    expect(out.map((p) => p.slug)).toEqual([
      "sample-aviator-a",
      "sample-futuristic-a",
    ]);
  });

  it("searches name and description, case-insensitive", () => {
    expect(
      applyListingFilters(sampleProducts(), {
        ...baseParams,
        search: "AVIATOR",
      }).map((p) => p.slug),
    ).toEqual(["sample-aviator-a"]);
    expect(
      applyListingFilters(sampleProducts(), {
        ...baseParams,
        search: "futuristic sunglasses",
      }).map((p) => p.slug),
    ).toEqual(["sample-futuristic-a"]);
  });

  it("filters by price range (inclusive)", () => {
    const out = applyListingFilters(sampleProducts(), {
      ...baseParams,
      priceMin: 1000,
      priceMax: 2000,
    });
    expect(out.map((p) => p.slug)).toEqual(["sample-aviator-a"]);
  });

  it("hides out-of-stock products only when in-stock-only is set", () => {
    expect(
      applyListingFilters(sampleProducts(), baseParams).map((p) => p.slug),
    ).toHaveLength(3);
    expect(
      applyListingFilters(sampleProducts(), {
        ...baseParams,
        inStockOnly: true,
      }).map((p) => p.slug),
    ).toEqual(["sample-round-a", "sample-aviator-a"]);
  });
});

describe("sortProducts", () => {
  it("sorts by price low→high and high→low", () => {
    expect(
      sortProducts(sampleProducts(), "price-asc").map((p) => p.price_bdt),
    ).toEqual([950, 1450, 3200]);
    expect(
      sortProducts(sampleProducts(), "price-desc").map((p) => p.price_bdt),
    ).toEqual([3200, 1450, 950]);
  });

  it("sorts newest first by created_at", () => {
    expect(
      sortProducts(sampleProducts(), "newest").map((p) => p.slug),
    ).toEqual([
      "sample-futuristic-a",
      "sample-aviator-a",
      "sample-round-a",
    ]);
  });

  it("does not mutate the input array", () => {
    const products = sampleProducts();
    sortProducts(products, "price-desc");
    expect(products[0].slug).toBe("sample-round-a");
  });
});

describe("faceShapeChipLabel", () => {
  it("maps rating values to plain-word chips", () => {
    expect(faceShapeChipLabel("excellent")).toBe("Best fit");
    expect(faceShapeChipLabel("good")).toBe("Good fit");
    expect(faceShapeChipLabel("fair")).toBe("Fair fit");
  });
});

// ---------------------------------------------------------------------------
// RLS-safe read path shape (mocked Supabase client)
// ---------------------------------------------------------------------------

/** Minimal thenable query builder: every chain step returns itself. */
function makeBuilder(result: { data: unknown; error: null }) {
  const builder = {
    ...result,
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("RLS-safe read path (mocked client)", () => {
  it("listProducts throws CatalogueUnavailableError when no client is configured", async () => {
    mockedGetClient.mockReturnValue(null);
    await expect(listProducts(baseParams)).rejects.toBeInstanceOf(
      CatalogueUnavailableError,
    );
  });

  it("listProducts returns active products with primary images attached", async () => {
    const rows = sampleProducts().map((p) => ({
      ...p,
      categories: { slug: p.category_slug, name: p.category_name },
    }));
    const fakeClient = {
      from: (table: string) => {
        if (table === "products") {
          return makeBuilder({ data: rows, error: null });
        }
        return makeBuilder({
          data: rows.map((p) => ({
            product_id: p.id,
            storage_path: p.primary_image,
            is_primary: true,
            sort_order: 1,
          })),
          error: null,
        });
      },
    };
    mockedGetClient.mockReturnValue(
      fakeClient as unknown as ReturnType<typeof getSupabaseClient>,
    );

    const { products, total } = await listProducts(baseParams);
    expect(total).toBe(3);
    expect(products).toHaveLength(3);
    // Featured sort = category, then name: "men" sorts before "women".
    expect(products.map((p) => p.slug)).toEqual([
      "sample-aviator-a",
      "sample-futuristic-a",
      "sample-round-a",
    ]);
    const round = products.find((p) => p.slug === "sample-round-a");
    expect(round?.primary_image).toBe("/images/sample-round-a.webp");
  });

  it("getProductBySlug returns null without querying for an invalid slug", async () => {
    mockedGetClient.mockReturnValue(null);
    // Invalid slug short-circuits before any client use.
    await expect(getProductBySlug("BAD SLUG")).resolves.toBeNull();
    expect(mockedGetClient).not.toHaveBeenCalled();
  });

  it("getProductBySlug returns null when the product does not exist", async () => {
    const fakeClient = {
      from: () => makeBuilder({ data: null, error: null }),
    };
    mockedGetClient.mockReturnValue(
      fakeClient as unknown as ReturnType<typeof getSupabaseClient>,
    );
    await expect(getProductBySlug("no-such-product")).resolves.toBeNull();
  });
});
