import ProductDetailClient from "@/components/product-detail-client";
import ProductImage from "@/components/product-image";
import SiteHeader from "@/components/site-header";
import TrustStrip from "@/components/trust-strip";
import type { ProductDetail } from "@/lib/supabase/catalog";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BagProvider } from "@/lib/bag-context";

function sampleProduct(images: ProductDetail["images"]): ProductDetail {
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
    variants: [],
    images,
    measurements: null,
  };
}

describe("Icons", () => {
  it("header shows search and bag icons", () => {
    const { container } = render(<BagProvider><SiteHeader /></BagProvider>);

    // Exactly two decorative SVGs: search (in the input) and bag.
    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(
      screen.getByRole("searchbox", { name: "Search sunglasses" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Bag, 0 items/i }),
    ).toBeInTheDocument();
  });

  it("trust strip shows one icon per item", () => {
    const { container } = render(<TrustStrip />);

    expect(container.querySelectorAll("svg")).toHaveLength(3);
    expect(screen.getByText("Secure Payment")).toBeInTheDocument();
    expect(screen.getByText("Quality Assurance")).toBeInTheDocument();
    expect(screen.getByText("Customer Support")).toBeInTheDocument();
  });
});

describe("ProductImage zoom", () => {
  it("magnifies on hover and returns to normal on leave", () => {
    render(
      <ProductImage
        src="/images/sample-round-a.webp"
        alt="SAMPLE Round A"
        zoomable
        className="aspect-[4/3] w-full"
      />,
    );

    const zoomArea = screen.getByTestId("photo-zoom");
    const img = screen.getByRole("img", { name: "SAMPLE Round A" });

    fireEvent.mouseEnter(zoomArea);
    expect((img as HTMLElement).style.transform).toBe("scale(2)");

    fireEvent.mouseMove(zoomArea, { clientX: 10, clientY: 10 });
    expect((img as HTMLElement).style.transform).toBe("scale(2)");

    fireEvent.mouseLeave(zoomArea);
    expect((img as HTMLElement).style.transform).toBe("");
  });

  it("opens the lightbox from the zoom button and closes it with Escape", () => {
    render(
      <ProductImage
        src="/images/sample-round-a.webp"
        alt="SAMPLE Round A"
        zoomable
        className="aspect-[4/3] w-full"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /view larger photo/i }),
    );
    expect(
      screen.getByRole("dialog", { name: /photo viewer/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close photo viewer" }),
    ).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: /photo viewer/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the lightbox by clicking the photo and closes it from the close button", () => {
    render(
      <ProductImage
        src="/images/sample-round-a.webp"
        alt="SAMPLE Round A"
        zoomable
        className="aspect-[4/3] w-full"
      />,
    );

    fireEvent.click(screen.getByTestId("photo-zoom"));
    expect(
      screen.getByRole("dialog", { name: /photo viewer/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close photo viewer" }),
    );
    expect(
      screen.queryByRole("dialog", { name: /photo viewer/i }),
    ).not.toBeInTheDocument();
  });

  it("has no zoom or lightbox when the photo is missing", () => {
    render(
      <ProductImage
        src={null}
        alt="SAMPLE Round A"
        zoomable
        className="aspect-[4/3] w-full"
      />,
    );

    expect(screen.getByText("Photo coming soon")).toBeInTheDocument();
    expect(screen.queryByTestId("photo-zoom")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /view larger photo/i }),
    ).not.toBeInTheDocument();
  });

  it("does not zoom listing and thumbnail photos", () => {
    render(
      <ProductImage
        src="/images/sample-round-a.webp"
        alt="SAMPLE Round A"
        className="aspect-[4/3] w-full"
      />,
    );

    expect(screen.queryByTestId("photo-zoom")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /view larger photo/i }),
    ).not.toBeInTheDocument();
  });
});

describe("ProductDetailClient zoom", () => {
  it("main photo is zoomable when the product has a photo", () => {
    render(
      <BagProvider>
        <ProductDetailClient
          product={sampleProduct([
            {
              id: "img-1",
              storage_path: "/images/sample-round-a.webp",
              alt_text: "SAMPLE Round A",
              sort_order: 0,
              is_primary: true,
            },
          ])}
        />
      </BagProvider>,
    );

    expect(screen.getByTestId("photo-zoom")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view larger photo/i }),
    ).toBeInTheDocument();
  });

  it("main photo has no zoom when the product has no photos", () => {
    render(<BagProvider><ProductDetailClient product={sampleProduct([])} /></BagProvider>);

    expect(screen.getByText("Photo coming soon")).toBeInTheDocument();
    expect(screen.queryByTestId("photo-zoom")).not.toBeInTheDocument();
  });
});
