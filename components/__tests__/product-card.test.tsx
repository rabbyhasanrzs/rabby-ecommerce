import ProductCard from "@/components/product-card";
import type { ProductSummary } from "@/lib/supabase/catalog";
import { WishlistProvider } from "@/lib/wishlist-context";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

const STORAGE_KEY = "rabby-wishlist-v1";

const SAMPLE: ProductSummary = {
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
};

beforeEach(() => {
  window.localStorage.clear();
});

function renderCard(product: ProductSummary = SAMPLE) {
  return render(
    <WishlistProvider>
      <ul>
        <ProductCard product={product} />
      </ul>
    </WishlistProvider>,
  );
}

describe("ProductCard polish (S-5)", () => {
  it("keeps the existing content — name, category, integer BDT price, stock in words", () => {
    renderCard();

    expect(screen.getByText("SAMPLE Round A")).toBeInTheDocument();
    expect(screen.getByText("Women")).toBeInTheDocument();
    expect(screen.getByText("৳950")).toBeInTheDocument();
    expect(screen.getByText("In Stock")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /SAMPLE Round A/ }),
    ).toHaveAttribute("href", "/product/sample-round-a");
  });

  it("has the prototype finish — subtle shadow, hover lift, visible focus ring", () => {
    renderCard();

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
    renderCard();

    const image = screen.getByAltText("SAMPLE Round A");
    expect(image.className).toContain("group-hover:scale-[1.02]");
    // The price and stock are still in the card (hover never hides them).
    expect(screen.getByText("৳950")).toBeInTheDocument();
    expect(screen.getByText("In Stock")).toBeInTheDocument();
  });

  it("shows Out of Stock in words when stock is zero", () => {
    renderCard({ ...SAMPLE, stock_total: 0 });

    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
  });
});

describe("ProductCard wishlist heart (S-7)", () => {
  it("renders a heart toggle that is NOT nested inside the card link", () => {
    renderCard();

    const heart = screen.getByRole("button", {
      name: "Save SAMPLE Round A to wishlist",
    });
    // A <button> inside an <a> is invalid HTML and would navigate
    // on activation — the heart is a sibling of the link instead.
    expect(heart.closest("a")).toBeNull();
    expect(heart).toHaveAttribute("aria-pressed", "false");
    expect(heart).toHaveAttribute("type", "button");
    // The card link itself is untouched.
    expect(
      screen.getByRole("link", { name: /SAMPLE Round A/ }),
    ).toHaveAttribute("href", "/product/sample-round-a");
  });

  it("clicking the heart saves the product without navigating", async () => {
    renderCard();

    const heart = screen.getByRole("button", {
      name: "Save SAMPLE Round A to wishlist",
    });
    fireEvent.click(heart);

    expect(
      await screen.findByRole("button", {
        name: "Remove SAMPLE Round A from wishlist",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) ?? "[]",
      ) as string[],
    ).toEqual(["sample-round-a"]);
    // Still on the same page — no navigation happened.
    expect(
      screen.getByRole("link", { name: /SAMPLE Round A/ }),
    ).toHaveAttribute("href", "/product/sample-round-a");
  });
});
