import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest rewrites import.meta.url, so resolve from the repo root instead.
const migration0007 = readFileSync(
  join(process.cwd(), "supabase/migrations/0007_s6_admin_write_grants.sql"),
  "utf8",
);

const migration0009 = readFileSync(
  join(process.cwd(), "supabase/migrations/0009_s7_coupon_redemption.sql"),
  "utf8",
);

const migration0010 = readFileSync(
  join(process.cwd(), "supabase/migrations/0010_s7_reviews.sql"),
  "utf8",
);

const migration0011 = readFileSync(
  join(process.cwd(), "supabase/migrations/0011_s7_home_reviews.sql"),
  "utf8",
);

const ADMIN_WRITTEN_TABLES = [
  "categories",
  "products",
  "product_variants",
  "product_images",
  "product_measurements",
  "site_settings",
  "discount_codes",
];

const NEVER_GRANTED_TABLES = [
  "orders",
  "order_items",
  "order_status_events",
  "payments",
  "server_secrets",
  "admins",
];

describe("migration 0007 — admin write grants", () => {
  it("grants SELECT, INSERT, UPDATE, DELETE on every admin-written table to authenticated", () => {
    for (const table of ADMIN_WRITTEN_TABLES) {
      expect(migration0007).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO authenticated;`,
      );
    }
  });

  it("grants nothing to the anonymous role and nothing on the function-only tables", () => {
    expect(migration0007).not.toMatch(/^GRANT[^;]*\bTO anon\b/im);
    for (const table of NEVER_GRANTED_TABLES) {
      expect(migration0007).not.toContain(`ON public.${table}`);
    }
  });
});

describe("migration 0009 — S-7 coupon redemption", () => {
  it("adds the discount columns to orders (re-run safe, integer BDT, non-negative)", () => {
    expect(migration0009).toContain(
      "ADD COLUMN IF NOT EXISTS discount_code text,",
    );
    expect(migration0009).toContain(
      "ADD COLUMN IF NOT EXISTS discount_bdt int NOT NULL DEFAULT 0",
    );
    expect(migration0009).toContain("CHECK (discount_bdt >= 0)");
  });

  it("defines validate_discount_code as SECURITY DEFINER and grants it to anon + authenticated", () => {
    expect(migration0009).toContain(
      "CREATE OR REPLACE FUNCTION public.validate_discount_code(p_code text)",
    );
    expect(migration0009).toContain("RETURNS int");
    expect(migration0009).toContain("SECURITY DEFINER");
    expect(migration0009).toContain(
      "GRANT EXECUTE ON FUNCTION public.validate_discount_code(text) TO anon, authenticated;",
    );
  });

  it("raises one single coupon_invalid error for missing and inactive codes (no enumeration leak)", () => {
    expect(migration0009).toContain("RAISE EXCEPTION 'coupon_invalid';");
    expect(migration0009).not.toContain("coupon_not_found");
    expect(migration0009).not.toContain("coupon_inactive");
    expect(migration0009).not.toContain("invalid_coupon");
  });

  it("normalises the code (trim + uppercase) inside the function", () => {
    expect(migration0009).toContain(
      "upper(btrim(COALESCE(p_code, '')))",
    );
    expect(migration0009).toContain("WHERE code = v_code AND active = true");
  });

  it("drops the 5-arg create_guest_order and recreates it with a 6th arg defaulting to NULL", () => {
    expect(migration0009).toContain(
      "DROP FUNCTION IF EXISTS public.create_guest_order(jsonb, text, jsonb, text, text);",
    );
    expect(migration0009).toContain("p_discount_code text DEFAULT NULL");
    expect(migration0009).toContain(
      "GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb, text, jsonb, text, text, text) TO anon, authenticated;",
    );
  });

  it("taxes the discounted subtotal and keeps the no-code math unchanged", () => {
    expect(migration0009).toContain(
      "v_discount := round(v_subtotal * v_percent_off / 100.0)::int;",
    );
    expect(migration0009).toContain(
      "v_discounted_subtotal := v_subtotal - v_discount;",
    );
    expect(migration0009).toContain(
      "v_tax := round(v_discounted_subtotal * v_tax_rate / 100.0)::int;",
    );
    expect(migration0009).toContain(
      "v_total := v_discounted_subtotal + v_tax + v_delivery_fee;",
    );
    expect(migration0009).toContain("RAISE EXCEPTION 'payment_method_disabled';");
  });

  it("stores the code and discount on the order row", () => {
    expect(migration0009).toContain("discount_code, discount_bdt,");
    expect(migration0009).toContain("v_discount_code, v_discount,");
  });

  it("returns discount_code and discount_bdt from lookup_guest_order and admin_get_order", () => {
    expect(migration0009).toContain("'discount_code', v_order.discount_code,");
    expect(migration0009).toContain("'discount_bdt', v_order.discount_bdt,");
  });
});

describe("migration 0010 — S-7 product reviews", () => {
  it("creates the reviews table (re-run safe, rating CHECKs, one review per order+product)", () => {
    expect(migration0010).toContain(
      "CREATE TABLE IF NOT EXISTS public.reviews (",
    );
    expect(migration0010).toContain("rating           int NOT NULL CHECK (rating BETWEEN 1 AND 5),");
    expect(migration0010).toContain(
      "CHECK (status IN ('pending', 'approved', 'rejected'))",
    );
    expect(migration0010).toContain(
      "CONSTRAINT reviews_one_per_order_product UNIQUE (order_id, product_id)",
    );
    expect(migration0010).toContain(
      "body             text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),",
    );
  });

  it("is admin-only RLS with no anon policy and no anon table grant", () => {
    expect(migration0010).toContain(
      "ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;",
    );
    expect(migration0010).toContain(
      "CREATE POLICY reviews_admin_all ON public.reviews",
    );
    // No TABLE grant to anon (the EXECUTE grants to anon on the
    // SECURITY DEFINER functions below are the intended public path
    // — the table itself is never readable by anon).
    expect(migration0010).not.toMatch(
      /^GRANT\s+(SELECT|INSERT|UPDATE|DELETE)[^;]*\bTO anon\b/im,
    );
    expect(migration0010).not.toContain("reviews_select_public");
  });

  it("grants the admin write privileges on reviews to authenticated", () => {
    expect(migration0010).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;",
    );
  });

  it("defines the three SECURITY DEFINER functions with anon + authenticated EXECUTE", () => {
    expect(migration0010).toContain(
      "CREATE OR REPLACE FUNCTION public.get_product_reviews(p_slug text)",
    );
    expect(migration0010).toContain(
      "CREATE OR REPLACE FUNCTION public.get_product_review_aggregates(p_slugs text[])",
    );
    expect(migration0010).toContain(
      "CREATE OR REPLACE FUNCTION public.submit_review(",
    );
    expect(migration0010).toContain("SECURITY DEFINER");
    expect(migration0010).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_product_reviews(text) TO anon, authenticated;",
    );
    expect(migration0010).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_product_review_aggregates(text[]) TO anon, authenticated;",
    );
    expect(migration0010).toContain(
      "GRANT EXECUTE ON FUNCTION public.submit_review(text, text, text, int, int, int, int, text) TO anon, authenticated;",
    );
  });

  it("returns only approved reviews with the F12 aggregate (average, count, breakdown, sub-ratings)", () => {
    expect(migration0010).toContain("status = 'approved'");
    expect(migration0010).toContain("'average_rating'");
    expect(migration0010).toContain("'review_count'");
    expect(migration0010).toContain("'breakdown'");
    expect(migration0010).toContain("'quality_average'");
    expect(migration0010).toContain("'value_average'");
    expect(migration0010).toContain("'fit_average'");
  });

  it("shares one order-not-found error for a missing order and a mismatched phone (no enumeration leak)", () => {
    expect(migration0010).toContain("RAISE EXCEPTION 'review_order_not_found';");
    expect(migration0010).not.toContain("review_order_not_exist");
    expect(migration0010).not.toContain("review_phone_mismatch");
    expect(migration0010).not.toContain("review_phone_wrong");
  });

  it("requires a delivered order and the product in the order, and blocks duplicates", () => {
    expect(migration0010).toContain(
      "RAISE EXCEPTION 'review_order_not_delivered';",
    );
    expect(migration0010).toContain(
      "RAISE EXCEPTION 'review_product_not_in_order';",
    );
    expect(migration0010).toContain(
      "RAISE EXCEPTION 'review_already_submitted';",
    );
  });

  it("inserts as pending with the reviewer name from the order (never free text)", () => {
    expect(migration0010).toContain("v_order.customer_name,");
    expect(migration0010).toContain("btrim(p_body), 'pending'");
  });

  it("seeds no reviews — the only INSERT into reviews is the submit function itself", () => {
    expect(migration0010.match(/INSERT INTO public\.reviews/g)?.length).toBe(1);
  });
});

describe("migration 0011 — S-7 home-page reviews", () => {
  it("adds no table and no RLS change — it reuses the 0010 reviews table as-is", () => {
    expect(migration0011).not.toContain("CREATE TABLE");
    expect(migration0011).not.toContain("CREATE POLICY");
    expect(migration0011).not.toMatch(
      /^GRANT\s+(SELECT|INSERT|UPDATE|DELETE)[^;]*\bTO anon\b/im,
    );
  });

  it("defines get_recent_approved_reviews as SECURITY DEFINER with anon + authenticated EXECUTE", () => {
    expect(migration0011).toContain(
      "CREATE OR REPLACE FUNCTION public.get_recent_approved_reviews(p_limit int)",
    );
    expect(migration0011).toContain("SECURITY DEFINER");
    expect(migration0011).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_recent_approved_reviews(int) TO anon, authenticated;",
    );
  });

  it("returns only approved reviews of active products, newest first, with the product slug + name", () => {
    expect(migration0011).toContain("r.status = 'approved'");
    expect(migration0011).toContain("p.status = 'active'");
    expect(migration0011).toContain("ORDER BY r.created_at DESC");
    expect(migration0011).toContain("p.slug, p.name, r.reviewer_name, r.rating, r.body, r.created_at");
  });

  it("clamps the limit server-side to 1..10 and never returns phone, email, or order reference", () => {
    expect(migration0011).toContain(
      "LIMIT LEAST(GREATEST(COALESCE(p_limit, 3), 1), 10);",
    );
    expect(migration0011).not.toContain("customer_phone");
    expect(migration0011).not.toContain("customer_email");
    expect(migration0011).not.toContain("order_reference");
  });

  it("seeds no reviews", () => {
    expect(migration0011).not.toContain("INSERT INTO");
  });
});
