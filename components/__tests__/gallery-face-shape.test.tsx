import FaceShapeIcon from "@/components/face-shape-icon";
import ProductDetailClient from "@/components/product-detail-client";
import type { ProductDetail } from "@/lib/supabase/catalog";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BagProvider } from "@/lib/bag-context";

const THREE_IMAGES: ProductDetail["images"] = [
  {
    id: "img-1",
    storage_path: "/images/sample-round-a.webp",
    alt_text: "SAMPLE Round A photo 1",
    sort_order: 1,
    is_primary: true,
  },
  {
    id: "img-2",
    storage_path: "/images/sample-round-b.webp",
    alt_text: "SAMPLE Round A photo 2",
    sort_order: 2,
    is_primary: false,
  },
  {
    id: "img-3",
    storage_path: "/images/sample-round-c.webp",
    alt_text: "SAMPLE Round A photo 3",
    sort_order: 3,
    is_primary: false,
  },
];

function sampleProduct(
  images: ProductDetail["images"],
): ProductDetail {
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
    measurements: {
      lens_width_mm: 50,
      bridge_mm: 18,
      temple_mm: 140,
      frame_width_mm: 126,
      lens_height_mm: 44,
      face_shape_ratings: {
        Round: "fair",
        Square: "excellent",
        Oval: "excellent",
        Heart: "good",
      },
    },
  };
}

describe("Gallery viewer", () => {
  it("shows arrows and a 1 / N counter with more than one photo", () => {
    render(<BagProvider><ProductDetailClient product={sampleProduct(THREE_IMAGES)} /></BagProvider>);

    expect(
      screen.getByRole("button", { name: "Previous photo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next photo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    // The main photo lives inside the gallery region; the thumbnail
    // with the same alt text sits outside it, so scope the query.
    expect(
      within(screen.getByTestId("product-gallery")).getByRole("img", {
        name: "SAMPLE Round A photo 1",
      }),
    ).toBeInTheDocument();
  });

  it("next/previous arrows switch photos and wrap around", () => {
    render(<BagProvider><ProductDetailClient product={sampleProduct(THREE_IMAGES)} /></BagProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("product-gallery")).getByRole("img", {
        name: "SAMPLE Round A photo 2",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();

    // Next from the last photo wraps to the first.
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    // Previous from the first photo wraps to the last.
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("Left/Right arrow keys navigate the gallery", () => {
    render(<BagProvider><ProductDetailClient product={sampleProduct(THREE_IMAGES)} /></BagProvider>);

    const gallery = screen.getByTestId("product-gallery");
    fireEvent.keyDown(gallery, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.keyDown(gallery, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("thumbnails still switch photos", () => {
    render(<BagProvider><ProductDetailClient product={sampleProduct(THREE_IMAGES)} /></BagProvider>);

    fireEvent.click(screen.getByRole("button", { name: "View photo 3" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("product-gallery")).getByRole("img", {
        name: "SAMPLE Round A photo 3",
      }),
    ).toBeInTheDocument();
  });

  it("the lightbox shows the currently selected photo", () => {
    render(<BagProvider><ProductDetailClient product={sampleProduct(THREE_IMAGES)} /></BagProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    fireEvent.click(
      screen.getByRole("button", { name: /view larger photo/i }),
    );
    expect(
      screen.getByRole("dialog", {
        name: "Photo viewer — SAMPLE Round A photo 2",
      }),
    ).toBeInTheDocument();
  });

  it("shows no arrows or counter with a single photo", () => {
    render(
      <BagProvider>
        <ProductDetailClient product={sampleProduct(THREE_IMAGES.slice(0, 1))} />
      </BagProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "Previous photo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next photo" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/\/ 1/)).not.toBeInTheDocument();
  });

  it("shows no arrows or counter with no photos", () => {
    render(<BagProvider><ProductDetailClient product={sampleProduct([])} /></BagProvider>);

    expect(
      screen.queryByRole("button", { name: "Previous photo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next photo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /photo coming soon/i }),
    ).toBeInTheDocument();
  });
});

describe("Face-shape icons", () => {
  it("renders one icon per shape in the data, and no Oblong chip", () => {
    const { container } = render(
      <BagProvider>
        <ProductDetailClient product={sampleProduct(THREE_IMAGES)} />
      </BagProvider>,
    );

    // Four chips (Round, Square, Oval, Heart) -> four face icons
    // (each carries a .face-shape-draw outline group; the two gallery
    // chevron icons do not).
    expect(container.querySelectorAll(".face-shape-draw")).toHaveLength(4);
    expect(screen.getByText("Round: Fair fit")).toBeInTheDocument();
    expect(screen.getByText("Square: Best fit")).toBeInTheDocument();
    expect(screen.getByText("Oval: Best fit")).toBeInTheDocument();
    expect(screen.getByText("Heart: Good fit")).toBeInTheDocument();
    // Oblong is not in the demo data, so no Oblong chip is invented.
    expect(screen.queryByText(/Oblong/)).not.toBeInTheDocument();
  });

  it("pulses the best-fit (Excellent) icons only", () => {
    const { container } = render(
      <BagProvider>
        <ProductDetailClient product={sampleProduct(THREE_IMAGES)} />
      </BagProvider>,
    );

    // Square and Oval are "excellent" in the mock data; Round and Heart
    // are not. Exactly two icons carry the pulse class.
    expect(container.querySelectorAll("svg.face-shape-best")).toHaveLength(2);
  });

  it("draws all five face types, falling back to oval for unknown names", () => {
    const { container } = render(
      <>
        <FaceShapeIcon shape="Oval" />
        <FaceShapeIcon shape="Round" />
        <FaceShapeIcon shape="Square" />
        <FaceShapeIcon shape="Heart" />
        <FaceShapeIcon shape="Oblong" />
        <FaceShapeIcon shape="NotARealShape" />
      </>,
    );

    expect(container.querySelectorAll("svg")).toHaveLength(6);
  });
});
