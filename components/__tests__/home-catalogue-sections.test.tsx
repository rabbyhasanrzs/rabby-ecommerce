import HomeCatalogueSections from "@/components/home-catalogue-sections";
import {
  listActivities,
  listCategories,
  listProducts,
  type Activity,
  type Category,
  type ProductSummary,
} from "@/lib/supabase/catalog";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

// HomeCatalogueSections renders ProductCards, which carry a wishlist
// heart (useWishlist) — same mock as app/__tests__/home.test.tsx.
vi.mock("@/lib/wishlist-context", () => ({
  useWishlist: () => ({
    slugs: [],
    count: 0,
    loaded: true,
    isSaved: () => false,
    toggle: vi.fn(),
  }),
}));

/**
 * Mock only the Supabase reads; the real parseListingParams /
 * CatalogueUnavailableError stay intact.
 */
vi.mock("@/lib/supabase/catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/supabase/catalog")>();
  return {
    ...actual,
    listActivities: vi.fn(),
    listCategories: vi.fn(),
    listProducts: vi.fn(),
  };
});

const mockedListActivities = vi.mocked(listActivities);
const mockedListCategories = vi.mocked(listCategories);
const mockedListProducts = vi.mocked(listProducts);

const CATEGORIES: Category[] = [
  { id: "c1", slug: "women", name: "Women", sort_order: 1 },
];

function product(
  id: string,
  slug: string,
  name: string,
): ProductSummary {
  return {
    id,
    slug,
    name,
    description: `${name} description`,
    category_id: "c1",
    category_slug: "women",
    category_name: "Women",
    activities: [],
    price_bdt: 950,
    stock_total: 12,
    is_demo: true,
    created_at: "2026-11-18T00:00:00Z",
    primary_image: "/images/sample-round-a.webp",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListCategories.mockResolvedValue(CATEGORIES);
  mockedListProducts.mockResolvedValue({
    products: [product("1", "sample-round-a", "SAMPLE Round A")],
    total: 1,
  });
});

/**
 * Shop by Activity on the home page (S-7, 1.x-6, F17) — text-only
 * tiles after Shop by category, hidden when nothing is tagged.
 */
describe("HomeCatalogueSections — Shop by Activity", () => {
  it("shows the tagged activities as tiles, in the docs' order, linking to the filtered listing", async () => {
    const activities: Activity[] = [
      { slug: "driving", label: "Driving" },
      { slug: "sport", label: "Sport" },
      { slug: "everyday", label: "Everyday" },
    ];
    mockedListActivities.mockResolvedValue(activities);
    render(await HomeCatalogueSections());

    expect(
      screen.getByRole("heading", { name: "Shop by Activity" }),
    ).toBeInTheDocument();
    const links = screen.getAllByRole("link", {
      name: /^(Driving|Sport|Everyday)$/,
    });
    // Docs order (driving, sport, beach, everyday), proven by href —
    // the tile text also carries the "→" arrow, so textContent is
    // not a clean order signal.
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/sunglasses?activity=driving",
      "/sunglasses?activity=sport",
      "/sunglasses?activity=everyday",
    ]);
    expect(screen.getByRole("link", { name: "Driving" })).toHaveAttribute(
      "href",
      "/sunglasses?activity=driving",
    );
    expect(screen.getByRole("link", { name: "Sport" })).toHaveAttribute(
      "href",
      "/sunglasses?activity=sport",
    );
    expect(screen.getByRole("link", { name: "Everyday" })).toHaveAttribute(
      "href",
      "/sunglasses?activity=everyday",
    );
    // No photo tiles — text only in v1.
    expect(screen.queryByRole("img", { name: /Driving|Sport|Everyday/ })).not.toBeInTheDocument();
  });

  it("shows only the tagged activities — an untagged activity never appears", async () => {
    mockedListActivities.mockResolvedValue([
      { slug: "beach", label: "Beach" },
    ]);
    render(await HomeCatalogueSections());

    expect(screen.getByRole("link", { name: "Beach" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Driving" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sport" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Everyday" }),
    ).not.toBeInTheDocument();
  });

  it("hides the whole section when nothing is tagged (the honest empty state)", async () => {
    mockedListActivities.mockResolvedValue([]);
    const { container } = render(await HomeCatalogueSections());

    expect(
      screen.queryByRole("heading", { name: "Shop by Activity" }),
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("Shop by Activity");
    // The rest of the home still renders.
    expect(
      screen.getByRole("heading", { name: "Shop by category" }),
    ).toBeInTheDocument();
  });
});
