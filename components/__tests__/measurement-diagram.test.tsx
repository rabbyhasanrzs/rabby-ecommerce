import MeasurementDiagram from "@/components/measurement-diagram";
import ProductDetailClient from "@/components/product-detail-client";
import type {
  ProductDetail,
  ProductMeasurements,
} from "@/lib/supabase/catalog";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BagProvider } from "@/lib/bag-context";

// S-7: ProductDetailClient carries a wishlist heart (useWishlist).
vi.mock("@/lib/wishlist-context", () => ({
  useWishlist: () => ({
    slugs: [],
    count: 0,
    loaded: true,
    isSaved: () => false,
    toggle: vi.fn(),
  }),
}));

/** Seeded values for sample-round-a (supabase/migrations/0001_s1_catalogue.sql). */
function roundAMeasurements(): ProductMeasurements {
  return {
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
  };
}

function sampleProduct(
  measurements: ProductMeasurements | null,
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
    images: [],
    measurements,
  };
}

describe("MeasurementDiagram", () => {
  it("renders the product's own numbers on the front and side views", () => {
    render(<MeasurementDiagram measurements={roundAMeasurements()} />);

    const diagram = screen.getByRole("img", {
      name: /frame width 126 mm, lens 50 mm, bridge 18 mm, lens height 44 mm, temple 140 mm/i,
    });
    expect(diagram).toBeInTheDocument();
    expect(screen.getByText("Frame width 126 mm")).toBeInTheDocument();
    expect(screen.getByText("Lens 50 mm")).toBeInTheDocument();
    expect(screen.getByText("Bridge 18 mm")).toBeInTheDocument();
    expect(screen.getByText("Temple 140 mm")).toBeInTheDocument();
    expect(screen.getByText("44 mm")).toBeInTheDocument();
    expect(screen.getByText("Front view")).toBeInTheDocument();
    expect(screen.getByText("Side view")).toBeInTheDocument();
  });

  it("renders nothing when measurements are null", () => {
    const { container } = render(<MeasurementDiagram measurements={null} />);
    expect(container.firstChild).toBeNull();
    expect(
      screen.queryByRole("img", { name: /measurement diagram/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a dash for a missing dimension instead of inventing a number", () => {
    render(
      <MeasurementDiagram
        measurements={{ ...roundAMeasurements(), temple_mm: null }}
      />,
    );
    expect(screen.getByText("Temple —")).toBeInTheDocument();
    expect(screen.getByText("Frame width 126 mm")).toBeInTheDocument();
  });
});

describe("ProductDetailClient measurements", () => {
  it("shows the diagram above the text list when measurements exist", () => {
    render(<BagProvider><ProductDetailClient product={sampleProduct(roundAMeasurements())} /></BagProvider>);

    expect(
      screen.getByRole("img", { name: /frame width 126 mm/i }),
    ).toBeInTheDocument();
    // The accessible text list stays as well.
    expect(
      screen.getByRole("heading", { name: "Measurements" }),
    ).toBeInTheDocument();
  });

  it("hides the diagram and the measurements section when measurements are null", () => {
    render(<BagProvider><ProductDetailClient product={sampleProduct(null)} /></BagProvider>);

    expect(
      screen.queryByRole("img", { name: /measurement diagram/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Measurements" }),
    ).not.toBeInTheDocument();
  });
});
