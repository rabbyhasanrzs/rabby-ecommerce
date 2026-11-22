import ProductCard from "@/components/product-card";
import type { ProductSummary } from "@/lib/supabase/catalog";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const SAMPLE: ProductSummary = {
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
};

describe("ProductCard polish (S-5)", () => {
  it("keeps the existing content — name, category, integer BDT price, stock in words", () => {
    render(
      <ul>
        <ProductCard product={SAMPLE} />
      </ul>,
    );

    expect(screen.getByText("SAMPLE Round A")).toBeInTheDocument();
    expect(screen.getByText("Women")).toBeInTheDocument();
    expect(screen.getByText("৳950")).toBeInTheDocument();
    expect(screen.getByText("In Stock")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /SAMPLE Round A/ }),
    ).toHaveAttribute("href", "/product/sample-round-a");
  });

  it("has the prototype finish — subtle shadow, hover lift, visible focus ring", () => {
    render(
      <ul>
        <ProductCard product={SAMPLE} />
      </ul>,
    );

    const card = screen
      .getByRole("link", { name: /SAMPLE Round A/ })
      .closest("li");
    expect(card).not.toBeNull();
    expect(card?.className).toContain("shadow-sm");
    expect(card?.className).toContain("hover:-translate-y-0.5");
    expect(card?.className).toContain("hover:shadow-md");
    expect(card?.className).toContain("focus-within:ring-2");
  });

  it("scales the image very slightly on hover, without hiding the price or stock", () => {
    render(
      <ul>
        <ProductCard product={SAMPLE} />
      </ul>,
    );

    const image = screen.getByAltText("SAMPLE Round A");
    expect(image.className).toContain("group-hover:scale-[1.02]");
    // The price and stock are still in the card (hover never hides them).
    expect(screen.getByText("৳950")).toBeInTheDocument();
    expect(screen.getByText("In Stock")).toBeInTheDocument();
  });

  it("shows Out of Stock in words when stock is zero", () => {
    render(
      <ul>
        <ProductCard product={{ ...SAMPLE, stock_total: 0 }} />
      </ul>,
    );

    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
  });
});
