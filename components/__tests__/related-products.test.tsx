import RelatedProducts from "@/components/related-products";
import type { ProductSummary } from "@/lib/supabase/catalog";
import type { ProductReviewAggregate } from "@/lib/supabase/reviews";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function product(
  id: string,
  slug: string,
  name: string,
  stockTotal: number,
): ProductSummary {
  return {
    id,
    slug,
    name,
    description: `${name} sunglasses`,
    category_id: "c2",
    category_slug: "men",
    category_name: "Men",
    price_bdt: 1450,
    stock_total: stockTotal,
    is_demo: true,
    created_at: "2026-11-19T00:00:00Z",
    primary_image: `/images/${slug}.webp`,
  };
}

const RELATED: ProductSummary[] = [
  product("4", "sample-aviator-a", "SAMPLE Aviator A", 8),
  product("5", "sample-square-gold-a", "SAMPLE Square Gold A", 5),
  product("6", "sample-futuristic-a", "SAMPLE Futuristic A", 0),
  product("7", "sample-blue-tint-a", "SAMPLE Blue Tint A", 15),
];

const AGGREGATES = new Map<string, ProductReviewAggregate>([
  [
    "sample-aviator-a",
    { productSlug: "sample-aviator-a", reviewCount: 2, averageRating: 5 },
  ],
]);

describe("RelatedProducts — S-7 cross-sell (F13, 1.x-2)", () => {
  it("shows the 'You May Also Like' heading, 4 link-only cards, and a View All link to the shop", () => {
    render(<RelatedProducts products={RELATED} aggregates={AGGREGATES} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "You May Also Like" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View All/ }),
    ).toHaveAttribute("href", "/sunglasses");

    for (const item of RELATED) {
      expect(
        screen.getByRole("link", { name: new RegExp(item.name) }),
      ).toHaveAttribute("href", `/product/${item.slug}`);
    }
    // Link-only cards: no Add to Bag button anywhere in the row.
    expect(
      screen.queryByRole("button", { name: /add to bag/i }),
    ).not.toBeInTheDocument();
  });

  it("never claims similarity or 'customers also bought'", () => {
    const { container } = render(
      <RelatedProducts products={RELATED} aggregates={AGGREGATES} />,
    );
    expect(container.textContent).not.toMatch(/similar/i);
    expect(container.textContent).not.toMatch(/customers also bought/i);
    expect(container.textContent).not.toMatch(/matching/i);
  });

  it("shows the out-of-stock card with its disabled state, still linked to its product page", () => {
    render(<RelatedProducts products={RELATED} aggregates={AGGREGATES} />);

    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /SAMPLE Futuristic A/ }),
    ).toHaveAttribute("href", "/product/sample-futuristic-a");
  });

  it("shows a rating only where real approved reviews exist", () => {
    render(<RelatedProducts products={RELATED} aggregates={AGGREGATES} />);

    expect(screen.getByText("5.0 (2)")).toBeInTheDocument();
    // The other three cards have no aggregate — no other rating line.
    expect(screen.getAllByText(/out of 5 stars/)).toHaveLength(1);
  });

  it("renders nothing when there are no related products", () => {
    const { container } = render(
      <RelatedProducts products={[]} aggregates={new Map()} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("heading", { name: "You May Also Like" }),
    ).not.toBeInTheDocument();
  });
});
