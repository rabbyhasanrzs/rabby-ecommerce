import Home from "@/app/page";
import HomeCatalogueSections from "@/components/home-catalogue-sections";
import {
  CatalogueUnavailableError,
  listCategories,
  listProducts,
  type Category,
  type ProductSummary,
} from "@/lib/supabase/catalog";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedResolveHeroPhoto } = vi.hoisted(() => ({
  // Default: the photo exists. Tests that need the no-photo hero
  // override this with mockReturnValueOnce(null).
  mockedResolveHeroPhoto: vi.fn((): string | null => "/images/hero.jpg"),
}));

/**
 * The hero photo is a binary the owner uploads later, so it is NOT
 * in the repo — the real resolveHeroPhoto() reads the filesystem and
 * returns null in a fresh checkout / CI. Mock it so this file's
 * assertions are the same in every environment; the filesystem
 * behaviour itself is covered by lib/__tests__/hero-photo.test.ts.
 */
vi.mock("@/lib/hero-photo", () => ({
  resolveHeroPhoto: mockedResolveHeroPhoto,
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

/**
 * Mock only the Supabase reads; the real parseListingParams /
 * sortProducts / CatalogueUnavailableError stay intact, so the test
 * proves the home asks for the listing's own "newest" definition.
 */
vi.mock("@/lib/supabase/catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/supabase/catalog")>();
  return {
    ...actual,
    listCategories: vi.fn(),
    listProducts: vi.fn(),
  };
});

const mockedListCategories = vi.mocked(listCategories);
const mockedListProducts = vi.mocked(listProducts);

const CATEGORIES: Category[] = [
  { id: "c1", slug: "women", name: "Women", sort_order: 1 },
  { id: "c2", slug: "men", name: "Men", sort_order: 2 },
  { id: "c3", slug: "polarized", name: "Polarized", sort_order: 3 },
];

function product(
  id: string,
  slug: string,
  name: string,
  createdAt: string,
): ProductSummary {
  return {
    id,
    slug,
    name,
    description: `${name} description`,
    category_id: "c1",
    category_slug: "women",
    category_name: "Women",
    price_bdt: 950,
    stock_total: 12,
    is_demo: true,
    created_at: createdAt,
    primary_image: "/images/sample-round-a.webp",
  };
}

const NEWEST_FIVE = [
  product("5", "p-five", "Newest Five", "2026-11-20T00:00:00Z"),
  product("4", "p-four", "Newest Four", "2026-11-19T00:00:00Z"),
  product("3", "p-three", "Newest Three", "2026-11-18T00:00:00Z"),
  product("2", "p-two", "Newest Two", "2026-11-17T00:00:00Z"),
  product("1", "p-one", "Oldest One", "2026-11-16T00:00:00Z"),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockedListCategories.mockResolvedValue(CATEGORIES);
  mockedListProducts.mockResolvedValue({
    products: NEWEST_FIVE,
    total: 5,
  });
});

describe("Home page (S-5 build-out)", () => {
  it("renders the hero — one H1, subcopy, Shop sunglasses CTA, and the hero photo when present", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Find sunglasses that fit you.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Shop sunglasses" }),
    ).toHaveAttribute("href", "/sunglasses");
    // Hero photo mocked present (see the mock above): a real <img>,
    // not a placeholder.
    expect(
      screen.getByAltText(
        "Woman wearing white sunglasses outdoors in bright sunlight",
      ),
    ).toBeInTheDocument();
  });

  it("renders a finished typographic hero with no image when the photo is absent", () => {
    mockedResolveHeroPhoto.mockReturnValueOnce(null);
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Find sunglasses that fit you.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Shop sunglasses" }),
    ).toHaveAttribute("href", "/sunglasses");
    expect(
      screen.queryByAltText(
        "Woman wearing white sunglasses outdoors in bright sunlight",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows the approved 3-item trust strip", () => {
    render(<Home />);

    expect(screen.getByText("Secure Payment")).toBeInTheDocument();
    expect(screen.getByText("Quality Assurance")).toBeInTheDocument();
    expect(screen.getByText("Customer Support")).toBeInTheDocument();
  });

  it("teasers link to the face-shape guide and to Help", () => {
    render(<Home />);

    expect(
      screen.getByRole("link", { name: "Open the face-shape guide" }),
    ).toHaveAttribute("href", "/guide/face-shape");
    expect(
      screen.getByRole("link", { name: "Visit Help & FAQ" }),
    ).toHaveAttribute("href", "/help");
  });

  it("has no 'Placeholder' text anywhere on the static shell", () => {
    render(<Home />);

    expect(screen.queryByText(/Placeholder/i)).not.toBeInTheDocument();
  });
});

describe("HomeCatalogueSections (awaited server component)", () => {
  it("shows Shop by category tiles from the real catalogue, linking to the filtered listing", async () => {
    render(await HomeCatalogueSections());

    expect(
      screen.getByRole("heading", { name: "Shop by category" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Women" })).toHaveAttribute(
      "href",
      "/sunglasses?category=women",
    );
    expect(screen.getByRole("link", { name: "Men" })).toHaveAttribute(
      "href",
      "/sunglasses?category=men",
    );
    expect(screen.getByRole("link", { name: "Polarized" })).toHaveAttribute(
      "href",
      "/sunglasses?category=polarized",
    );
    expect(screen.queryByText(/Placeholder/i)).not.toBeInTheDocument();
  });

  it("shows new arrivals with the listing's 'newest' definition — newest 4 only", async () => {
    render(await HomeCatalogueSections());

    expect(
      screen.getByRole("heading", { name: "New arrivals" }),
    ).toBeInTheDocument();
    expect(mockedListProducts).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "newest" }),
    );
    expect(screen.getByText("Newest Five")).toBeInTheDocument();
    expect(screen.getByText("Newest Four")).toBeInTheDocument();
    expect(screen.getByText("Newest Three")).toBeInTheDocument();
    expect(screen.getByText("Newest Two")).toBeInTheDocument();
    expect(screen.queryByText("Oldest One")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View all new arrivals" }),
    ).toHaveAttribute("href", "/sunglasses?sort=newest");
  });

  it("still renders a plain-words note (no broken state) when the catalogue cannot be loaded", async () => {
    mockedListCategories.mockRejectedValue(
      new CatalogueUnavailableError(),
    );
    mockedListProducts.mockRejectedValue(new CatalogueUnavailableError());
    render(await HomeCatalogueSections());

    expect(
      screen.getByText(
        "New arrivals could not be loaded right now. Please try again later.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Placeholder/i)).not.toBeInTheDocument();
  });
});
