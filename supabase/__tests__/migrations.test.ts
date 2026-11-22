import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest rewrites import.meta.url, so resolve from the repo root instead.
const migration0007 = readFileSync(
  join(process.cwd(), "supabase/migrations/0007_s6_admin_write_grants.sql"),
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
