import BagPage from "@/app/bag/page";
import CheckoutPage from "@/app/checkout/page";
import FaceShapeGuidePage from "@/app/guide/face-shape/page";
import HelpPage from "@/app/help/page";
import Home from "@/app/page";
import SunglassesPage from "@/app/sunglasses/page";
import HomeCatalogueSections from "@/components/home-catalogue-sections";
import ProductCard from "@/components/product-card";
import ProductDetailClient from "@/components/product-detail-client";
import type {
  ProductDetail,
  ProductSummary,
} from "@/lib/supabase/catalog";
import { render, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import type { AxeMatchers } from "vitest-axe/matchers";
import "vitest-axe/extend-expect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coordinator fix (assembly): vitest-axe 0.1.0 augments the old `Vi`
 * namespace, which Vitest 4 no longer uses for `Assertion` — so
 * `toHaveNoViolations()` type-checked as missing even though the
 * runtime matcher (registered below via expect.extend) works.
 *
 * This is vitest-axe's documented empty-interface augmentation.
 * The three disabled rules are deliberate, not sloppy: the type
 * parameter must match vitest's `Assertion<T = any>` exactly or
 * tsc fails with TS2428, and the matcher methods come from
 * `AxeMatchers`, so the interfaces declare no members of their own.
 */
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

expect.extend(matchers);

/**
 * Accessibility — S-5, T-55 (WCAG 2.2 AA, axe in CI).
 *
 * These tests assert VIOLATIONS ONLY — never page content. Content
 * belongs to Slices A/B, which are writing these pages in parallel;
 * a content change must not break this suite. (Readiness waits use
 * `findBy*`/`waitFor` only to let async rendering settle; the only
 * pass/fail assertions are `toHaveNoViolations()`.)
 *
 * What jsdom can and cannot do here — verified by probe 2026-11-22,
 * not assumed:
 * - Async Server Components rendered as JSX (`<ListingContent />`,
 *   `<HomeCatalogueSections />` inside Suspense) CANNOT render in
 *   jsdom: React logs "async Client Component" and keeps the
 *   Suspense fallback. So the /sunglasses listing content (filter
 *   form + grid) is NOT axe-tested through the page: instead the
 *   page shell is tested, plus ProductCard directly (the grid's
 *   repeated, interactive content). The filter form itself can only
 *   be axe-checked in a real browser — owner preview check.
 * - An async page/section whose data work happens BEFORE it returns
 *   JSX CAN be tested by awaiting the function first
 *   (`await HomeCatalogueSections()`, `await FaceShapeGuidePage()`).
 *   That is how the home catalogue sections and the guide are covered.
 * - jsdom has no stylesheets, so axe cannot evaluate colour contrast
 *   here — contrast is a manual preview check in the owner checklist.
 * - Manual keyboard + screen-reader spot-checks cannot run from this
 *   VM at all — they are owner preview checks, not claimed here.
 */

const { pushMock, seededItems } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  seededItems: [
    {
      slug: "sample-round-a",
      name: "SAMPLE Round A",
      priceBdt: 950,
      image: "/images/sample-round-a.webp",
      variantColour: "Black",
      quantity: 1,
    },
  ],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/bag-context", () => ({
  useBag: () => ({
    items: seededItems,
    itemCount: 1,
    subtotalBdt: 950,
    addItem: vi.fn(),
    removeItem: vi.fn(),
    setQuantity: vi.fn(),
    clearBag: vi.fn(),
    isDrawerOpen: false,
    openDrawer: vi.fn(),
    closeDrawer: vi.fn(),
  }),
}));

// S-7: ProductCard and the PDP carry a wishlist heart (useWishlist).
// Stub it the same way as the bag — a11y asserts violations only.
vi.mock("@/lib/wishlist-context", () => ({
  useWishlist: () => ({
    slugs: [],
    count: 0,
    loaded: true,
    isSaved: () => false,
    toggle: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/catalog", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/supabase/catalog")>();
  return {
    ...original,
    listCategories: async () => [
      { id: "c1", slug: "women", name: "Women", sort_order: 1 },
      { id: "c2", slug: "men", name: "Men", sort_order: 2 },
    ],
    listProducts: async () => ({
      products: [
        {
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
        },
      ],
      total: 1,
    }),
  };
});

vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return {
    ...original,
    connection: async () => {},
  };
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  // One stub serves both fetches these pages make: /api/settings
  // (checkout) and /api/bag/validate (bag). The JSON carries both
  // shapes; each caller reads only its own fields.
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      ok: true,
      items: [],
      issues: [],
      taxRatePercent: 5,
      deliveryInsideFeeBdt: 60,
      deliveryInsideEstimate: "1–2 days",
      deliveryOutsideFeeBdt: 120,
      deliveryOutsideEstimate: "3–5 days",
      paymentCodEnabled: true,
      paymentBkashEnabled: true,
      paymentNagadEnabled: true,
      paymentRocketEnabled: true,
      paymentCardEnabled: true,
      websiteNotice: "",
      supportWhatsapp: "",
      supportMessenger: "",
      supportPhone: "",
      supportEmail: "",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sampleProduct(): ProductDetail {
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
    variants: [
      {
        id: "v1",
        colour: "Black",
        price_bdt: null,
        stock_quantity: null,
        sort_order: 0,
      },
    ],
    images: [
      {
        id: "i1",
        storage_path: "/images/sample-round-a.webp",
        alt_text: "SAMPLE Round A",
        sort_order: 0,
        is_primary: true,
      },
      {
        id: "i2",
        storage_path: "/images/sample-round-b.webp",
        alt_text: "SAMPLE Round A side view",
        sort_order: 1,
        is_primary: false,
      },
    ],
    measurements: {
      lens_width_mm: 52,
      bridge_mm: 18,
      temple_mm: 140,
      frame_width_mm: 138,
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

describe("axe — no violations", () => {
  it("Home — hero, trust strip, teasers + catalogue sections", async () => {
    const { container } = render(<Home />);
    expect(await axe(container)).toHaveNoViolations();
    // The catalogue sections sit behind Suspense as an async Server
    // Component, so they are awaited and axe-tested on their own.
    const sections = render(await HomeCatalogueSections());
    expect(await axe(sections.container)).toHaveNoViolations();
  });

  it("/help", async () => {
    const { container } = render(<HelpPage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("/guide/face-shape", async () => {
    const { container } = render(await FaceShapeGuidePage());
    expect(await axe(container)).toHaveNoViolations();
  });

  it("/sunglasses — page shell only (see header note)", async () => {
    const { container } = render(
      await SunglassesPage({ searchParams: Promise.resolve({}) }),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("/sunglasses — product cards (the listing grid's content)", async () => {
    const inStock: ProductSummary = {
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
    const outOfStock: ProductSummary = {
      ...inStock,
      id: "2",
      slug: "sample-aviator-a",
      name: "SAMPLE Aviator A",
      price_bdt: 1450,
      stock_total: 0,
      primary_image: null,
    };
    const { container } = render(
      <ul>
        <ProductCard product={inStock} />
        <ProductCard product={outOfStock} />
      </ul>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("product detail (PDP client, mocked product)", async () => {
    const { container } = render(
      <ProductDetailClient product={sampleProduct()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("/bag (mocked bag, validation fetch stubbed)", async () => {
    const { container } = render(<BagPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("/checkout (mocked bag, settings fetch stubbed)", async () => {
    const { container } = render(<CheckoutPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
