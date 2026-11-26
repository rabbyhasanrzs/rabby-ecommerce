import { formatPriceBdt, stockLabel } from "@/lib/format";
import {
  applyListingFilters,
  CatalogueUnavailableError,
  faceShapeChipLabel,
  getProductBySlug,
  getRelatedProducts,
  isValidSlug,
  listActivities,
  listProducts,
  parseListingParams,
  pickRelatedProducts,
  RELATED_PRODUCTS_LIMIT,
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
      activities: ["driving", "everyday"],
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
      activities: ["driving"],
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
      activities: [],
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
  activity: "",
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
      activity: "",
      sort: "featured",
      inStockOnly: false,
    });
  });

  it("parses search, category, activity, sort, prices, and in-stock toggle", () => {
    const parsed = parseListingParams({
      search: "aviator",
      category: "men",
      activity: "driving",
      sort: "price-asc",
      priceMin: "1000",
      priceMax: "2000",
      inStockOnly: "true",
    });
    expect(parsed.search).toBe("aviator");
    expect(parsed.category).toBe("men");
    expect(parsed.activity).toBe("driving");
    expect(parsed.sort).toBe("price-asc");
    expect(parsed.priceMin).toBe(1000);
    expect(parsed.priceMax).toBe(2000);
    expect(parsed.inStockOnly).toBe(true);
  });

  it("falls back to safe defaults on invalid values", () => {
    const parsed = parseListingParams({ sort: "cheapest", category: "BAD SLUG", activity: "BAD SLUG" });
    expect(parsed.sort).toBe("featured");
    expect(parsed.category).toBe("");
    expect(parsed.activity).toBe("");
  });

  it("keeps a valid-but-unknown activity slug (it filters to zero products, like an unknown category)", () => {
    expect(parseListingParams({ activity: "golf" }).activity).toBe("golf");
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

  it("filters by activity (S-7 Shop by Activity)", () => {
    expect(
      applyListingFilters(sampleProducts(), {
        ...baseParams,
        activity: "driving",
      }).map((p) => p.slug),
    ).toEqual(["sample-round-a", "sample-aviator-a"]);
    expect(
      applyListingFilters(sampleProducts(), {
        ...baseParams,
        activity: "everyday",
      }).map((p) => p.slug),
    ).toEqual(["sample-round-a"]);
    // An untagged product never matches, and an unknown activity
    // matches nothing — the empty state, not an error.
    expect(
      applyListingFilters(sampleProducts(), {
        ...baseParams,
        activity: "beach",
      }),
    ).toHaveLength(0);
    expect(
      applyListingFilters(sampleProducts(), {
        ...baseParams,
        activity: "golf",
      }),
    ).toHaveLength(0);
  });

  it("combines activity with category and search", () => {
    expect(
      applyListingFilters(sampleProducts(), {
        ...baseParams,
        category: "women",
        activity: "everyday",
        search: "round",
      }).map((p) => p.slug),
    ).toEqual(["sample-round-a"]);
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

// ---------------------------------------------------------------------------
// Shop by Activity — S-7 (F17, 1.x-6)
// ---------------------------------------------------------------------------

describe("listActivities", () => {
  function mockActivitiesRows(
    rows: { activities: string[] | null }[],
  ) {
    const fakeClient = {
      from: () => makeBuilder({ data: rows, error: null }),
    };
    mockedGetClient.mockReturnValue(
      fakeClient as unknown as ReturnType<typeof getSupabaseClient>,
    );
  }

  it("throws CatalogueUnavailableError when no client is configured", async () => {
    mockedGetClient.mockReturnValue(null);
    await expect(listActivities()).rejects.toBeInstanceOf(
      CatalogueUnavailableError,
    );
  });

  it("returns only tagged activities, in the docs' order", async () => {
    mockActivitiesRows([
      { activities: ["driving", "everyday"] },
      { activities: ["driving"] },
      { activities: [] },
      { activities: ["sport"] },
    ]);
    expect(await listActivities()).toEqual([
      { slug: "driving", label: "Driving" },
      { slug: "sport", label: "Sport" },
      { slug: "everyday", label: "Everyday" },
    ]);
  });

  it("returns an empty list when nothing is tagged", async () => {
    mockActivitiesRows([{ activities: [] }, { activities: null }]);
    expect(await listActivities()).toEqual([]);
  });

  it("ignores unknown slugs instead of showing them", async () => {
    mockActivitiesRows([{ activities: ["golf", "beach"] }]);
    expect(await listActivities()).toEqual([
      { slug: "beach", label: "Beach" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Related products — S-7 cross-sell (F13, 1.x-2)
// ---------------------------------------------------------------------------

/**
 * The 8 seed products (0001_s1_catalogue.sql): 3 Women, 3 Men,
 * 2 Polarized — one out of stock (Futuristic A). Mirrors the real
 * demo catalogue so the fill behaviour is tested at real size.
 */
function seedCatalogue(): ProductSummary[] {
  const rows: Array<{
    id: string;
    slug: string;
    name: string;
    category_id: string;
    category_slug: string;
    category_name: string;
    price_bdt: number;
    stock_total: number;
    created_at: string;
  }> = [
    { id: "1", slug: "sample-round-a", name: "SAMPLE Round A", category_id: "c1", category_slug: "women", category_name: "Women", price_bdt: 950, stock_total: 12, created_at: "2026-11-18T00:00:00Z" },
    { id: "2", slug: "sample-hexagon-a", name: "SAMPLE Hexagon A", category_id: "c1", category_slug: "women", category_name: "Women", price_bdt: 1100, stock_total: 2, created_at: "2026-11-18T00:00:00Z" },
    { id: "3", slug: "sample-red-lens-a", name: "SAMPLE Red Lens A", category_id: "c1", category_slug: "women", category_name: "Women", price_bdt: 850, stock_total: 18, created_at: "2026-11-18T00:00:00Z" },
    { id: "4", slug: "sample-aviator-a", name: "SAMPLE Aviator A", category_id: "c2", category_slug: "men", category_name: "Men", price_bdt: 1450, stock_total: 8, created_at: "2026-11-19T00:00:00Z" },
    { id: "5", slug: "sample-square-gold-a", name: "SAMPLE Square Gold A", category_id: "c2", category_slug: "men", category_name: "Men", price_bdt: 2400, stock_total: 5, created_at: "2026-11-19T00:00:00Z" },
    { id: "6", slug: "sample-futuristic-a", name: "SAMPLE Futuristic A", category_id: "c2", category_slug: "men", category_name: "Men", price_bdt: 3200, stock_total: 0, created_at: "2026-11-20T00:00:00Z" },
    { id: "7", slug: "sample-blue-tint-a", name: "SAMPLE Blue Tint A", category_id: "c3", category_slug: "polarized", category_name: "Polarized", price_bdt: 1750, stock_total: 15, created_at: "2026-11-20T00:00:00Z" },
    { id: "8", slug: "sample-tortoise-a", name: "SAMPLE Tortoise A", category_id: "c3", category_slug: "polarized", category_name: "Polarized", price_bdt: 1900, stock_total: 7, created_at: "2026-11-20T00:00:00Z" },
  ];
  return rows.map((row) => ({
    ...row,
    description: `${row.name} sunglasses`,
    activities: [],
    is_demo: true,
    primary_image: `/images/${row.slug}.webp`,
  }));
}

describe("pickRelatedProducts", () => {
  it("puts same-category products first, then fills to 4, never the current product", () => {
    const catalogue = seedCatalogue();
    const current = catalogue.find((p) => p.slug === "sample-round-a")!;
    const related = pickRelatedProducts(current, catalogue);
    // Women first (Hexagon A, Red Lens A — featured order = name),
    // then the fill: Men before Polarized (featured = category, then name).
    expect(related.map((p) => p.slug)).toEqual([
      "sample-hexagon-a",
      "sample-red-lens-a",
      "sample-aviator-a",
      "sample-futuristic-a",
    ]);
    expect(related).not.toContain(current);
  });

  it("fills to 4 from other categories when the category has only one other product", () => {
    const catalogue = seedCatalogue();
    const current = catalogue.find((p) => p.slug === "sample-blue-tint-a")!;
    const related = pickRelatedProducts(current, catalogue);
    // Polarized has one other product (Tortoise A), then the fill.
    expect(related.map((p) => p.slug)).toEqual([
      "sample-tortoise-a",
      "sample-aviator-a",
      "sample-futuristic-a",
      "sample-square-gold-a",
    ]);
  });

  it("includes out-of-stock products (the card shows their disabled state)", () => {
    const catalogue = seedCatalogue();
    const current = catalogue.find((p) => p.slug === "sample-aviator-a")!;
    const related = pickRelatedProducts(current, catalogue);
    // Futuristic A (stock 0, same category Men) is in the row.
    expect(related.map((p) => p.slug)).toContain("sample-futuristic-a");
  });

  it("returns fewer than 4 when the catalogue is tiny, and empty when it holds only the current product", () => {
    const catalogue = seedCatalogue();
    const current = catalogue[0];
    const tiny = [current, catalogue[1]];
    expect(pickRelatedProducts(current, tiny).map((p) => p.slug)).toEqual([
      "sample-hexagon-a",
    ]);
    expect(pickRelatedProducts(current, [current])).toEqual([]);
    expect(pickRelatedProducts(current, [])).toEqual([]);
  });

  it("respects the limit and is deterministic (same input, same order)", () => {
    const catalogue = seedCatalogue();
    const current = catalogue.find((p) => p.slug === "sample-round-a")!;
    expect(pickRelatedProducts(current, catalogue, 2).map((p) => p.slug)).toEqual([
      "sample-hexagon-a",
      "sample-red-lens-a",
    ]);
    expect(pickRelatedProducts(current, catalogue, 0)).toEqual([]);
    expect(RELATED_PRODUCTS_LIMIT).toBe(4);
    expect(pickRelatedProducts(current, catalogue)).toEqual(
      pickRelatedProducts(current, catalogue),
    );
  });

  it("treats a product with no category as fill-only (no same-category group)", () => {
    const catalogue = seedCatalogue();
    const uncategorised: ProductSummary = {
      ...catalogue[0],
      id: "9",
      slug: "sample-uncategorised-a",
      name: "SAMPLE Uncategorised A",
      category_id: null,
      category_slug: null,
      category_name: null,
    };
    const related = pickRelatedProducts(uncategorised, [
      ...catalogue,
      uncategorised,
    ]);
    expect(related).toHaveLength(4);
    expect(related.map((p) => p.slug)).toEqual([
      "sample-aviator-a",
      "sample-futuristic-a",
      "sample-square-gold-a",
      "sample-blue-tint-a",
    ]);
  });
});

describe("getRelatedProducts (mocked client)", () => {
  it("reads the active catalogue once and picks 4 related products", async () => {
    const rows = seedCatalogue().map((p) => ({
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

    const current = rows.find((p) => p.slug === "sample-round-a")!;
    const related = await getRelatedProducts(current);
    expect(related).toHaveLength(4);
    expect(related.map((p) => p.slug)).toEqual([
      "sample-hexagon-a",
      "sample-red-lens-a",
      "sample-aviator-a",
      "sample-futuristic-a",
    ]);
    expect(related[0]?.primary_image).toBe("/images/sample-hexagon-a.webp");
  });

  it("throws CatalogueUnavailableError when no client is configured", async () => {
    mockedGetClient.mockReturnValue(null);
    const current = seedCatalogue()[0];
    await expect(getRelatedProducts(current)).rejects.toBeInstanceOf(
      CatalogueUnavailableError,
    );
  });
});
