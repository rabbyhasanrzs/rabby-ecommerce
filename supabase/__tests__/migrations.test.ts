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
