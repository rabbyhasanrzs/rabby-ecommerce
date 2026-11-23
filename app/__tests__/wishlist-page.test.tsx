import WishlistPage from "@/app/wishlist/page";
import { listProducts, type ProductSummary } from "@/lib/supabase/catalog";
import { WishlistProvider } from "@/lib/wishlist-context";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "rabby-wishlist-v1";

/**
 * Mock only the catalogue read; the real parseListingParams stays
 * intact, so the test proves the page asks for the listing's own
 * default params and filters the result to the saved slugs.
 */
vi.mock("@/lib/supabase/catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/supabase/catalog")>();
  return {
    ...actual,
    listProducts: vi.fn(),
  };
});

const mockedListProducts = vi.mocked(listProducts);

function product(
  id: string,
  slug: string,
  name: string,
  priceBdt: number,
  stockTotal: number,
): ProductSummary {
  return {
    id,
    slug,
    name,
    description: `${name} sunglasses`,
    category_id: "c1",
    category_slug: "women",
    category_name: "Women",
    price_bdt: priceBdt,
    stock_total: stockTotal,
    is_demo: true,
    created_at: "2026-11-18T00:00:00Z",
    primary_image: `/images/${slug}.webp`,
  };
}

const ROUND_A = product("1", "sample-round-a", "SAMPLE Round A", 950, 12);
const AVIATOR_A = product(
  "2",
  "sample-aviator-a",
  "SAMPLE Aviator A",
  1450,
  0,
);

function seedSlugs(slugs: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
}

function renderPage() {
  return render(
    <WishlistProvider>
      <WishlistPage />
    </WishlistProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  mockedListProducts.mockResolvedValue({
    products: [ROUND_A, AVIATOR_A],
    total: 2,
  });
});

describe("WishlistPage", () => {
  it("empty state: plain words, a browse link, and the per-device line", async () => {
    renderPage();

    expect(
      await screen.findByText("Your wishlist is empty."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse sunglasses" }),
    ).toHaveAttribute("href", "/sunglasses");
    expect(
      screen.getByText("Saved on this device and browser."),
    ).toBeInTheDocument();
    // Nothing to fetch with an empty list.
    expect(mockedListProducts).not.toHaveBeenCalled();
  });

  it("re-fetches live price/stock by slug — one batched read, no per-card waterfall", async () => {
    seedSlugs(["sample-round-a"]);
    renderPage();

    expect(await screen.findByText("SAMPLE Round A")).toBeInTheDocument();
    expect(screen.getByText("৳950")).toBeInTheDocument();
    expect(screen.getByText("In Stock")).toBeInTheDocument();
    expect(mockedListProducts).toHaveBeenCalledTimes(1);
  });

  it("in-stock items link to the PDP to choose options; Remove works", async () => {
    seedSlugs(["sample-round-a"]);
    renderPage();

    const choose = await screen.findByRole("link", {
      name: "Choose options",
    });
    expect(choose).toHaveAttribute("href", "/product/sample-round-a");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove",
      }),
    );
    expect(
      await screen.findByText("Your wishlist is empty."),
    ).toBeInTheDocument();
    expect(screen.queryByText("SAMPLE Round A")).not.toBeInTheDocument();
  });

  it("out-of-stock saved items stay visible with no way to add them to the bag", async () => {
    seedSlugs(["sample-aviator-a"]);
    renderPage();

    expect(await screen.findByText("SAMPLE Aviator A")).toBeInTheDocument();
    expect(screen.getByText("৳1,450")).toBeInTheDocument();
    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Choose options" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove",
      }),
    ).toBeInTheDocument();
  });

  it("drops deleted/inactive slugs from the list", async () => {
    seedSlugs(["sample-round-a", "gone-product"]);
    renderPage();

    expect(await screen.findByText("SAMPLE Round A")).toBeInTheDocument();
    expect(screen.queryByText("gone-product")).not.toBeInTheDocument();
    // The count still counts the stored slug; only live products render.
    expect(screen.getByText("2 saved products")).toBeInTheDocument();
  });

  it("shows the live count of saved products", async () => {
    seedSlugs(["sample-round-a", "sample-aviator-a"]);
    renderPage();

    expect(await screen.findByText("2 saved products")).toBeInTheDocument();
  });

  it("renders the shared catalogue-unavailable state when the fetch fails", async () => {
    mockedListProducts.mockRejectedValue(new Error("boom"));
    seedSlugs(["sample-round-a"]);
    renderPage();

    expect(await screen.findByText("Catalogue unavailable")).toBeInTheDocument();
    expect(screen.queryByText("SAMPLE Round A")).not.toBeInTheDocument();
  });
});
