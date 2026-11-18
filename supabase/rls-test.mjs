// ============================================================================
// Rabby e-commerce — S-1 RLS test (anon key only, read + denied-write probes)
// File: supabase/rls-test.mjs
//
// WHAT IT DOES
//   Probes the Supabase PostgREST endpoints with the ANON key and checks the
//   deny-by-default RLS contract from audit §5 / migration 0001:
//     * anon SELECT returns rows ONLY for public rows
//       (categories is_active=true, products status='active', and the
//       variant/image/measurement rows of active products only)
//     * anon INSERT / UPDATE / DELETE on every S-1 table is DENIED
//       (PostgREST returns 401 or 403 for an RLS denial)
//   Prints PASS/FAIL per check and exits 0 only if every check passes.
//
// WHAT IT CANNOT DO YET — EXPECTED FAILURE BEFORE THE MIGRATION RUNS
//   This script CANNOT pass until migration 0001_s1_catalogue.sql has been
//   applied in the Supabase dashboard (the test project currently has ZERO
//   tables). Before that, every SELECT fails with 404 PGRST205
//   ("Could not find the table ... in the schema cache") and the script
//   exits non-zero — that is the correct signal, not a bug in the script.
//   Apply the migration first, then re-run this script.
//
// HOW TO RUN (from the repo root; needs Node 18+ for global fetch)
//   # load the public anon vars (never the service_role key) into the env:
//   set -a; source .env.local; set +a
//   node supabase/rls-test.mjs
//   # Or pass them inline (same shell only):
//   NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co" \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>" node supabase/rls-test.mjs
//
//   The script reads ONLY NEXT_PUBLIC_SUPABASE_URL and
//   NEXT_PUBLIC_SUPABASE_ANON_KEY from the environment. It never reads,
//   prints, or needs the service_role key or the DB password.
//   It performs NO writes that can succeed: the INSERT/UPDATE/DELETE
//   probes are expected to be rejected by RLS, and use a slug
//   ('rls-probe-...') that can never collide with real data.
// ============================================================================

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!BASE || !ANON_KEY) {
  console.error(
    "ERROR: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
      "in the environment first (see the header comment).",
  );
  process.exit(2);
}

const url = BASE.replace(/\/$/, "");
const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function rest(method, path, body) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const isTableMissing = (r) =>
  r.status === 404 && r.data && r.data.code === "PGRST205";

// ---------------------------------------------------------------------------
// 1. Anon SELECT — public rows must be readable, in the seeded quantities.
// ---------------------------------------------------------------------------

const categories = await rest("GET", "categories?select=id,slug,name,is_active&order=sort_order");
if (isTableMissing(categories)) {
  check("tables exist (categories readable)", false,
    "404 PGRST205 — migration 0001 has NOT been applied yet; apply it in the dashboard SQL editor, then re-run this script.");
  console.log("\nRESULT: FAIL — tables do not exist yet (expected before the migration runs).");
  process.exit(1);
}
check("anon SELECT categories returns 200", categories.status === 200, `HTTP ${categories.status}`);
check("anon SELECT categories returns exactly 3 active rows",
  Array.isArray(categories.data) && categories.data.length === 3 &&
  categories.data.every((c) => c.is_active === true),
  Array.isArray(categories.data) ? `${categories.data.length} rows` : JSON.stringify(categories.data).slice(0, 120));
check("anon SELECT categories slugs are women/men/polarized",
  Array.isArray(categories.data) &&
  ["women", "men", "polarized"].every((s) => categories.data.some((c) => c.slug === s)));

const products = await rest("GET", "products?select=id,slug,name,price_bdt,stock_total,status,is_demo&order=slug");
check("anon SELECT products returns 200", products.status === 200, `HTTP ${products.status}`);
check("anon SELECT products returns exactly 8 active demo rows",
  Array.isArray(products.data) && products.data.length === 8 &&
  products.data.every((p) => p.status === "active" && p.is_demo === true),
  Array.isArray(products.data) ? `${products.data.length} rows` : JSON.stringify(products.data).slice(0, 120));
check("anon SELECT products: out-of-stock sample-futuristic-a visible with stock_total 0",
  Array.isArray(products.data) &&
  products.data.some((p) => p.slug === "sample-futuristic-a" && p.stock_total === 0),
  "an active product with 0 stock must still be readable (it shows Out of Stock, it is not hidden)");

// Inactive rows must never leak: no inactive product exists in the seed, so
// this filter must return 0 rows. (A real negative test needs an inactive
// row inserted as postgres in the dashboard; see the note at the end.)
const inactive = await rest("GET", "products?select=id&status=eq.inactive");
check("anon SELECT products?status=eq.inactive returns 0 rows",
  inactive.status === 200 && Array.isArray(inactive.data) && inactive.data.length === 0,
  `HTTP ${inactive.status}, ${Array.isArray(inactive.data) ? inactive.data.length : "?"} rows`);

const variants = await rest("GET", "product_variants?select=id,product_id,colour,price_bdt,stock_quantity");
check("anon SELECT product_variants returns 200 and exactly 16 rows (2 colours x 8 products)",
  variants.status === 200 && Array.isArray(variants.data) && variants.data.length === 16,
  `HTTP ${variants.status}, ${Array.isArray(variants.data) ? variants.data.length : "?"} rows`);
check("anon SELECT product_variants: demo variant price/stock are NULL (not invented)",
  Array.isArray(variants.data) &&
  variants.data.every((v) => v.price_bdt === null && v.stock_quantity === null));

const images = await rest("GET", "product_images?select=id,product_id,storage_path,is_primary");
check("anon SELECT product_images returns 200 and exactly 8 primary rows",
  images.status === 200 && Array.isArray(images.data) && images.data.length === 8 &&
  images.data.every((i) => i.is_primary === true),
  `HTTP ${images.status}, ${Array.isArray(images.data) ? images.data.length : "?"} rows`);
check("anon SELECT product_images: storage_path values are /images/<file>",
  Array.isArray(images.data) &&
  images.data.every((i) => typeof i.storage_path === "string" && i.storage_path.startsWith("/images/")));

const measurements = await rest("GET", "product_measurements?select=id,product_id,lens_width_mm,lens_height_mm,face_shape_ratings");
check("anon SELECT product_measurements returns 200 and exactly 8 rows",
  measurements.status === 200 && Array.isArray(measurements.data) && measurements.data.length === 8,
  `HTTP ${measurements.status}, ${Array.isArray(measurements.data) ? measurements.data.length : "?"} rows`);
check("anon SELECT product_measurements: lens_height_mm present and face_shape_ratings is an object",
  Array.isArray(measurements.data) &&
  measurements.data.every((m) => Number.isInteger(m.lens_height_mm) &&
    m.face_shape_ratings && typeof m.face_shape_ratings === "object"));

// ---------------------------------------------------------------------------
// 2. Anon WRITES — every INSERT / UPDATE / DELETE must be denied (401/403).
//    PostgREST returns 401 when RLS denies a write with the anon role;
//    accept 401 or 403, reject anything else (especially 2xx).
// ---------------------------------------------------------------------------

const denied = (r) => r.status === 401 || r.status === 403;

async function expectDenied(name, method, path, body) {
  const r = await rest(method, path, body);
  check(name, denied(r), `HTTP ${r.status} (expected 401 or 403)`);
}

const probeSlug = "rls-probe-should-never-exist";
await expectDenied("anon INSERT into products is denied", "POST", "products",
  { slug: probeSlug, name: "RLS probe", price_bdt: 1, stock_total: 0, status: "active", is_demo: true });
await expectDenied("anon INSERT into categories is denied", "POST", "categories",
  { slug: probeSlug, name: "RLS probe" });
await expectDenied("anon INSERT into product_variants is denied", "POST", "product_variants",
  { product_id: "00000000-0000-4000-8000-000000000000", colour: "Probe" });
await expectDenied("anon INSERT into product_images is denied", "POST", "product_images",
  { product_id: "00000000-0000-4000-8000-000000000000", storage_path: "/images/probe.webp" });
await expectDenied("anon INSERT into product_measurements is denied", "POST", "product_measurements",
  { product_id: "00000000-0000-4000-8000-000000000000", lens_width_mm: 50 });

// UPDATE/DELETE target a real seeded slug — a 2xx here would mean RLS is off.
await expectDenied("anon UPDATE on products is denied", "PATCH",
  "products?slug=eq.sample-round-a", { price_bdt: 1 });
await expectDenied("anon DELETE on products is denied", "DELETE",
  "products?slug=eq.sample-round-a");
await expectDenied("anon UPDATE on categories is denied", "PATCH",
  "categories?slug=eq.women", { name: "RLS probe" });
await expectDenied("anon DELETE on categories is denied", "DELETE",
  "categories?slug=eq.women");

// ---------------------------------------------------------------------------
// 3. Sanity: the probe rows must not exist (proves the denied writes really
//    did not land, even if a status code was misread above).
// ---------------------------------------------------------------------------
const probe = await rest("GET", `products?select=id&slug=eq.${probeSlug}`);
check("probe product row does not exist after denied INSERT",
  probe.status === 200 && Array.isArray(probe.data) && probe.data.length === 0,
  `HTTP ${probe.status}, ${Array.isArray(probe.data) ? probe.data.length : "?"} rows`);
const roundStillThere = await rest("GET", "products?select=id,price_bdt&slug=eq.sample-round-a");
check("sample-round-a still exists unchanged (price_bdt 950) after denied UPDATE/DELETE",
  roundStillThere.status === 200 && Array.isArray(roundStillThere.data) &&
  roundStillThere.data.length === 1 && roundStillThere.data[0].price_bdt === 950,
  JSON.stringify(roundStillThere.data).slice(0, 120));

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log("RESULT: FAIL — do NOT merge S-1 until every check passes.");
  process.exit(1);
}
console.log("RESULT: PASS — anon RLS contract holds for all 5 S-1 tables.");
console.log(
  "NOTE: this script tests the anon role only. The audit §5 also requires a " +
  "non-admin JWT denial test before merge — that needs a logged-in (non-admin) " +
  "user, which does not exist until Supabase Auth lands (S-4); the code agent " +
  "should record it as a remaining merge-gate item, not as covered here. " +
  "A stronger negative test (insert one inactive product as postgres in the " +
  "dashboard, confirm anon cannot see it, then delete it) is recommended " +
  "once, by hand, after this script passes.",
);
