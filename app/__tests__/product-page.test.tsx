import { ProductContent } from "@/app/product/[slug]/page";
import {
  getProductBySlug,
  getRelatedProducts,
  type ProductDetail,
  type ProductSummary,
} from "@/lib/supabase/catalog";
import {
  emptyReviewAggregate,
  getProductReviewAggregates,
  getProductReviews,
  type ReviewAggregate,
} from "@/lib/supabase/reviews";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

/**
 * The buy panel needs the bag provider, which the page test does not
 * set up — stub it. The test proves page composition (section order
 * and failure behaviour), not the buy panel itself.
 */
vi.mock("@/components/product-detail-client", () => ({
  default: () => <div data-testid="product-detail-client">Product detail</div>,
}));

// S-7: the "You May Also Like" row renders real ProductCards, which
// carry a wishlist heart (useWishlist).
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
 * Mock only the Supabase reads; the real isValidSlug stays intact, so
 * the test proves the page still 404s on a bad slug.
 */
vi.mock("@/lib/supabase/catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/supabase/catalog")>();
  return {
    ...actual,
    getProductBySlug: vi.fn(),
    getRelatedProducts: vi.fn(),
  };
});

vi.mock("@/lib/supabase/reviews", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/supabase/reviews")>();
  return {
    ...actual,
    getProductReviews: vi.fn(),
    getProductReviewAggregates: vi.fn(),
  };
});

const mockedGetProductBySlug = vi.mocked(getProductBySlug);
const mockedGetRelatedProducts = vi.mocked(getRelatedProducts);
const mockedGetProductReviews = vi.mocked(getProductReviews);
const mockedGetProductReviewAggregates = vi.mocked(getProductReviewAggregates);

const PRODUCT: ProductDetail = {
  id: "1",
  slug: "sample-round-a",
  name: "SAMPLE Round A",
  description: "Round sunglasses",
  category_id: "c1",
  category_slug: "women",
  category_name: "Women",
  activities: [],
  price_bdt: 950,
  stock_total: 12,
  is_demo: true,
  created_at: "2026-11-18T00:00:00Z",
  primary_image: "/images/sample-round-a.webp",
  variants: [],
  images: [],
  measurements: null,
};

function relatedProduct(id: string, slug: string, name: string): ProductSummary {
  return {
    id,
    slug,
    name,
    description: `${name} sunglasses`,
    category_id: "c1",
    category_slug: "women",
    category_name: "Women",
    activities: [],
    price_bdt: 1100,
    stock_total: 2,
    is_demo: true,
    created_at: "2026-11-18T00:00:00Z",
    primary_image: `/images/${slug}.webp`,
  };
}

const RELATED: ProductSummary[] = [
  relatedProduct("2", "sample-hexagon-a", "SAMPLE Hexagon A"),
  relatedProduct("3", "sample-red-lens-a", "SAMPLE Red Lens A"),
  relatedProduct("4", "sample-aviator-a", "SAMPLE Aviator A"),
  relatedProduct("6", "sample-futuristic-a", "SAMPLE Futuristic A"),
];

const AGGREGATE_WITH_REVIEW: ReviewAggregate = {
  productSlug: "sample-round-a",
  reviewCount: 1,
  averageRating: 5,
  breakdown: { "5": 1, "4": 0, "3": 0, "2": 0, "1": 0 },
  qualityAverage: 5,
  valueAverage: 5,
  fitAverage: 5,
  reviews: [
    {
      reviewerName: "Test Buyer",
      rating: 5,
      qualityRating: 5,
      valueRating: 5,
      fitRating: 5,
      body: "Great fit and very comfortable.",
      createdAt: "2026-11-23T10:00:00Z",
    },
  ],
};

async function renderPage() {
  render(
    await ProductContent({ slug: "sample-round-a", prefilledReference: null }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetProductBySlug.mockResolvedValue(PRODUCT);
  mockedGetRelatedProducts.mockResolvedValue(RELATED);
  mockedGetProductReviews.mockResolvedValue(AGGREGATE_WITH_REVIEW);
  mockedGetProductReviewAggregates.mockResolvedValue(new Map());
});

describe("Product page — You May Also Like section (S-7 cross-sell)", () => {
  it("renders the row after the Reviews section (IA order: reviews 6, You May Also Like 7)", async () => {
    await renderPage();

    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Reviews",
      "You May Also Like",
    ]);
    expect(mockedGetRelatedProducts).toHaveBeenCalledTimes(1);
    expect(mockedGetRelatedProducts).toHaveBeenCalledWith(PRODUCT);
    // One batch aggregate call for the whole row, never per-card.
    expect(mockedGetProductReviewAggregates).toHaveBeenCalledTimes(1);
    expect(mockedGetProductReviewAggregates).toHaveBeenCalledWith([
      "sample-hexagon-a",
      "sample-red-lens-a",
      "sample-aviator-a",
      "sample-futuristic-a",
    ]);
  });

  it("still shows the row when there are no reviews yet", async () => {
    mockedGetProductReviews.mockResolvedValue(
      emptyReviewAggregate("sample-round-a"),
    );
    await renderPage();

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "You May Also Like",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Reviews" }),
    ).not.toBeInTheDocument();
  });

  it("renders the product page without the row when the related read fails", async () => {
    mockedGetRelatedProducts.mockRejectedValue(new Error("boom"));
    await renderPage();

    expect(
      await screen.findByTestId("product-detail-client"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "You May Also Like" }),
    ).not.toBeInTheDocument();
    // The reviews section is unaffected by the related failure.
    expect(
      screen.getByRole("heading", { level: 2, name: "Reviews" }),
    ).toBeInTheDocument();
  });

  it("renders no row when there are no related products", async () => {
    mockedGetRelatedProducts.mockResolvedValue([]);
    await renderPage();

    expect(
      await screen.findByTestId("product-detail-client"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "You May Also Like" }),
    ).not.toBeInTheDocument();
    // No batch aggregate call for an empty row.
    expect(mockedGetProductReviewAggregates).not.toHaveBeenCalled();
  });
});
