import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { buildProductJsonLd } from "@/lib/product-schema";
import {
  HERO_IMAGE_PATH,
  PAGE_SEO,
  SITE_URL,
  pageMetadata,
  pageSeo,
} from "@/lib/seo";
import type { ProductDetail } from "@/lib/supabase/catalog";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listProductsMock, CatalogueUnavailableError } = vi.hoisted(() => {
  class CatalogueUnavailableError extends Error {}
  return { listProductsMock: vi.fn(), CatalogueUnavailableError };
});

/**
 * The sitemap reads the catalogue when it can. In this test the
 * catalogue is stubbed: first it throws (catalogue unavailable), then
 * it returns two products — so both the fallback and the product-URL
 * paths are covered without touching the live database.
 */
vi.mock("@/lib/supabase/catalog", () => ({
  CatalogueUnavailableError,
  listProducts: listProductsMock,
  parseListingParams: () => ({}),
}));

beforeEach(() => {
  listProductsMock.mockReset();
});

function sampleProduct(overrides: Partial<ProductDetail> = {}): ProductDetail {
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
    ],
    measurements: null,
    ...overrides,
  };
}

describe("canonical base", () => {
  it("is the live Vercel URL only — no invented domain", () => {
    expect(SITE_URL).toBe("https://rabby-ecommerce-uhrm.vercel.app");
    expect(SITE_URL).not.toContain(" ");
  });

  it("hero image path has no literal space", () => {
    expect(HERO_IMAGE_PATH).not.toContain(" ");
    expect(HERO_IMAGE_PATH).toBe("/images/hero.jpg");
  });
});

describe("per-page metadata", () => {
  it("every route has a unique title and a unique description", () => {
    const entries = Object.entries(PAGE_SEO);
    expect(entries.length).toBeGreaterThanOrEqual(12);
    const titles = entries.map(([, seo]) => seo.title);
    const descriptions = entries.map(([, seo]) => seo.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const { title, description } of Object.values(PAGE_SEO)) {
      expect(title.trim().length).toBeGreaterThan(0);
      expect(description.trim().length).toBeGreaterThan(0);
      // BDT only — never USD/$ in metadata copy.
      expect(description).not.toContain("$");
      expect(description).not.toContain("USD");
    }
  });

  it("pageMetadata gives a canonical URL, OG url, and Twitter card with no spaces", () => {
    for (const path of Object.keys(PAGE_SEO)) {
      const meta = pageMetadata(path);
      expect(meta.alternates.canonical).toBe(`${SITE_URL}${path}`);
      expect(meta.openGraph.url).toBe(`${SITE_URL}${path}`);
      expect(meta.alternates.canonical).not.toContain(" ");
      expect(meta.openGraph.url).not.toContain(" ");
      expect(meta.twitter.card).toBe("summary");
    }
  });

  it("pageSeo throws for an unknown route", () => {
    expect(() => pageSeo("/no-such-route")).toThrow();
  });
});

describe("Product JSON-LD", () => {
  it("uses the real name, BDT integer price, and primary photo", () => {
    const jsonLd = buildProductJsonLd(sampleProduct());
    expect(jsonLd["@type"]).toBe("Product");
    expect(jsonLd.name).toBe("SAMPLE Round A");
    expect(jsonLd.description).toBe("Round sunglasses");
    expect(jsonLd.image).toBe(
      "https://rabby-ecommerce-uhrm.vercel.app/images/sample-round-a.webp",
    );
    const offers = jsonLd.offers as Record<string, unknown>;
    expect(offers.priceCurrency).toBe("BDT");
    expect(offers.price).toBe(950);
    expect(Number.isInteger(offers.price)).toBe(true);
    expect(offers.availability).toBe("https://schema.org/InStock");
    expect(offers.url).toBe(
      "https://rabby-ecommerce-uhrm.vercel.app/product/sample-round-a",
    );
  });

  it("marks an out-of-stock product OutOfStock", () => {
    const jsonLd = buildProductJsonLd(sampleProduct({ stock_total: 0 }));
    const offers = jsonLd.offers as Record<string, unknown>;
    expect(offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("omits image and description when the product has neither", () => {
    const jsonLd = buildProductJsonLd(
      sampleProduct({ images: [], description: null }),
    );
    expect(jsonLd).not.toHaveProperty("image");
    expect(jsonLd).not.toHaveProperty("description");
    const offers = jsonLd.offers as Record<string, unknown>;
    expect(offers.price).toBe(950);
  });
});

describe("sitemap", () => {
  it("lists every public route and never /admin when the catalogue is unavailable", async () => {
    listProductsMock.mockRejectedValue(new CatalogueUnavailableError());
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    // Every PAGE_SEO route except the transactional flow pages
    // (S-6, T-61, S6-10): /bag, /checkout, /orders and
    // /order/confirmation are guest-flow pages and must not be
    // indexed — they are absent from the sitemap by design.
    const sitemapRoutes = Object.keys(PAGE_SEO).filter(
      (path) =>
        path !== "/bag" &&
        path !== "/checkout" &&
        path !== "/orders" &&
        path !== "/order/confirmation",
    );
    for (const path of sitemapRoutes) {
      expect(urls).toContain(`${SITE_URL}${path}`);
    }
    for (const path of [
      "/bag",
      "/checkout",
      "/orders",
      "/order/confirmation",
    ]) {
      expect(urls).not.toContain(`${SITE_URL}${path}`);
    }
    expect(urls.some((url) => url.includes("/admin"))).toBe(false);
    for (const url of urls) {
      expect(url.startsWith(SITE_URL)).toBe(true);
      expect(url).not.toContain(" ");
    }
  });

  it("adds a URL per catalogue product when the catalogue can be read", async () => {
    listProductsMock.mockResolvedValue({
      products: [
        sampleProduct(),
        sampleProduct({
          id: "2",
          slug: "sample-aviator-a",
          name: "SAMPLE Aviator A",
          price_bdt: 1450,
          created_at: "2026-11-19T00:00:00Z",
        }),
      ],
      total: 2,
    });
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain(
      "https://rabby-ecommerce-uhrm.vercel.app/product/sample-round-a",
    );
    expect(urls).toContain(
      "https://rabby-ecommerce-uhrm.vercel.app/product/sample-aviator-a",
    );
    expect(urls.some((url) => url.includes("/admin"))).toBe(false);
  });
});

describe("robots (S-6, T-61, S6-10)", () => {
  it("disallows /admin and the transactional flow pages", () => {
    const rules = robots();
    expect(rules.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
    });
    const disallow = (rules.rules as { disallow: string[] }).disallow;
    for (const path of ["/admin", "/bag", "/checkout", "/order", "/orders"]) {
      expect(disallow).toContain(path);
    }
    expect(rules.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
