// ============================================================================
// Rabby e-commerce — S-1 + S-2 + S-3 RLS test (anon key only, read + denied-write probes)
// File: supabase/rls-test.mjs
//
// WHAT IT DOES
//   Probes the Supabase PostgREST endpoints with the ANON key and checks the
//   deny-by-default RLS contract from audit §5 / migrations 0001 + 0003 + 0004:
//   S-1:
//     * anon SELECT returns rows ONLY for public rows
//       (categories is_active=true, products status='active', and the
//       variant/image/measurement rows of active products only)
//     * anon INSERT / UPDATE / DELETE on every S-1 table is DENIED
//       (PostgREST returns 401 or 403 for an RLS denial)
//   S-2:
//     * anon SELECT on orders / order_items / order_status_events returns
//       0 rows — there are NO policies on these tables at all, so even
//       SELECT is denied; orders are readable ONLY through the SECURITY
//       DEFINER lookup function (reference + phone).
//     * anon INSERT into orders / order_items is DENIED (401/403).
//     * the SECURITY DEFINER functions exist and behave: lookup returns
//       null for an unknown reference, and create rejects invalid input
//       (the invalid-input probe creates NO order).
//   S-3:
//     * anon SELECT on payments returns 0 rows and anon INSERT /
//       UPDATE / DELETE on payments is DENIED — payments has RLS
//       enabled and NO policies, same as the orders tables.
//     * the SECURITY DEFINER mark_order_payment_status function returns
//       not_found for an unknown reference, and create_guest_order
//       rejects a mobile-banking order with an invalid TrxID (the
//       invalid-input probes create NO order).
//   S-4 (migration 0005):
//     * anon SELECT on site_settings returns the 1 seeded row
//       (public shop config — tax 5%, delivery 60/120); anon
//       UPDATE / INSERT / DELETE on site_settings is DENIED.
//     * anon SELECT on discount_codes returns 0 rows (no anon
//       policy) and anon INSERT into discount_codes is DENIED.
//     * anon INSERT into admins is DENIED (no policies at all).
//     * is_admin() answers an anon call with `false` (auth.uid() is
//       null, so EXISTS is false) — that is the safe answer, so the
//       anon check accepts `false` or not-callable (401/403/404).
//       The admin_* RPCs stay not-callable for anon (their own
//       {ok:false, error:"forbidden"} or 401/403/404).
//     * THE NON-ADMIN JWT TEST (closes the S-1 audit §5 open item):
//       a throwaway user is signed up via the Auth API, signs in,
//       and its JWT must get `false` from is_admin(), a denied
//       UPDATE on products, and 0 rows from SELECT orders. The
//       throwaway user cannot be deleted via the anon key — the
//       owner deletes it in the Auth dashboard. If the project has
//       email confirmation ON (the Supabase default), signup
//       returns no session and the JWT checks are recorded as
//       blocked with instructions, not passed silently.
//   Prints PASS/FAIL per check and exits 0 only if every check passes.
//
// WHAT IT CANNOT DO YET — EXPECTED FAILURE BEFORE THE MIGRATIONS RUN
//   This script CANNOT pass until migrations 0001_s1_catalogue.sql,
//   0003_s2_orders.sql AND 0004_s3_payment.sql have been applied in the
//   Supabase dashboard (the test project currently has ZERO tables).
//   Before that, every SELECT fails with 404 PGRST205 ("Could not find
//   the table ... in the schema cache") and the script exits non-zero —
//   that is the correct signal, not a bug in the script. Apply the
//   migrations first, then re-run this script. Section 4 exits with a
//   clear "migration 0003 has NOT been applied yet" message when the
//   orders tables are missing, even if migration 0001 already passed;
//   Section 5 records its 7 checks as blocked (not a crash) when the
//   payments table is missing, i.e. migration 0004 has not been applied
//   yet. Section 6 does the same for its 12 checks when
//   site_settings is missing, i.e. migration 0005 has not been applied
//   yet; its 3 non-admin-JWT checks are additionally recorded as
//   blocked when no JWT can be obtained (email confirmation ON — see
//   Section 6).
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

// PostgREST + RLS semantics for UPDATE/DELETE: with no UPDATE/DELETE
// policy, RLS silently filters the row out — the operation returns HTTP 200
// with an EMPTY array (0 rows affected), NOT 401/403. Only INSERT errors
// out (401). So for PATCH/DELETE, pass = 401/403, or 200 with 0 rows
// changed. The section-3 sanity checks (row still exists, price unchanged)
// are the real proof no write landed. (Verified live 2026-11-19: anon
// PATCH on sample-round-a returned HTTP 200 with body [].)
async function expectDeniedWrite(name, method, path, body) {
  const r = await rest(method, path, body);
  const noRowsChanged = r.status === 200 && Array.isArray(r.data) && r.data.length === 0;
  check(name, denied(r) || noRowsChanged,
    `HTTP ${r.status} (expected 401/403, or 200 with 0 rows changed)`);
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
await expectDeniedWrite("anon UPDATE on products is denied", "PATCH",
  "products?slug=eq.sample-round-a", { price_bdt: 1 });
await expectDeniedWrite("anon DELETE on products is denied", "DELETE",
  "products?slug=eq.sample-round-a");
await expectDeniedWrite("anon UPDATE on categories is denied", "PATCH",
  "categories?slug=eq.women", { name: "RLS probe" });
await expectDeniedWrite("anon DELETE on categories is denied", "DELETE",
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
// 4. S-2 orders — no direct anon access at all (migration 0003).
//    The orders tables have RLS enabled and NO policies: anon SELECT
//    returns 0 rows and anon INSERT is denied. The only access path is
//    the SECURITY DEFINER functions, probed below via /rpc/.
//    These checks run ONLY if the orders tables exist; a 404 PGRST205
//    means migration 0003 has not been applied yet.
// ---------------------------------------------------------------------------

const orders = await rest("GET", "orders?select=id,reference");
if (isTableMissing(orders)) {
  check("tables exist (orders readable)", false,
    "404 PGRST205 — migration 0003 has NOT been applied yet; apply it in the dashboard SQL editor, then re-run this script.");
  console.log("\nRESULT: FAIL — orders tables do not exist yet (migration 0003 not applied).");
  process.exit(1);
}
check("anon SELECT orders returns 200 with 0 rows (no policies — deny-by-default)",
  orders.status === 200 && Array.isArray(orders.data) && orders.data.length === 0,
  `HTTP ${orders.status}, ${Array.isArray(orders.data) ? orders.data.length : "?"} rows`);

const orderItems = await rest("GET", "order_items?select=id,order_id");
check("anon SELECT order_items returns 200 with 0 rows (no policies — deny-by-default)",
  orderItems.status === 200 && Array.isArray(orderItems.data) && orderItems.data.length === 0,
  `HTTP ${orderItems.status}, ${Array.isArray(orderItems.data) ? orderItems.data.length : "?"} rows`);

const orderEvents = await rest("GET", "order_status_events?select=id,order_id");
check("anon SELECT order_status_events returns 200 with 0 rows (no policies — deny-by-default)",
  orderEvents.status === 200 && Array.isArray(orderEvents.data) && orderEvents.data.length === 0,
  `HTTP ${orderEvents.status}, ${Array.isArray(orderEvents.data) ? orderEvents.data.length : "?"} rows`);

await expectDenied("anon INSERT into orders is denied", "POST", "orders",
  { reference: "RB-2026-000000", customer_name: "RLS probe", customer_phone: "01700000000",
    customer_email: "probe@example.com", delivery_address: "RLS probe address",
    delivery_zone: "inside", payment_method: "cod",
    subtotal_bdt: 1, tax_bdt: 0, delivery_fee_bdt: 60, total_bdt: 61, status: "placed" });
await expectDenied("anon INSERT into order_items is denied", "POST", "order_items",
  { order_id: "00000000-0000-4000-8000-000000000000",
    product_id: "00000000-0000-4000-8000-000000000000",
    product_slug: "rls-probe", product_name: "RLS probe",
    unit_price_bdt: 1, quantity: 1, line_total_bdt: 1 });

// SECURITY DEFINER functions: lookup of an unknown reference returns
// null (function exists, no order found — never reveal which failed).
const lookup = await rest("POST", "rpc/lookup_guest_order",
  { p_reference: "RB-2026-000000", p_phone: "01700000000" });
check("rpc lookup_guest_order returns 200 with data null for an unknown reference",
  lookup.status === 200 && lookup.data === null,
  `HTTP ${lookup.status}, data: ${JSON.stringify(lookup.data).slice(0, 120)}`);

// create with an INVALID phone must be rejected by the function's
// validation (4xx). Do NOT call it with valid data — that would create
// a real order (and decrement real stock).
// S-3: migration 0004 dropped the 3-argument create_guest_order and
// replaced it with the 5-argument version — the probe passes
// p_payment_reference / p_payment_sender (null for COD) or PostgREST
// would 404 on the missing function and the check would pass for the
// wrong reason.
const badCreate = await rest("POST", "rpc/create_guest_order",
  { p_customer: { name: "RLS probe", phone: "bad", email: "probe@example.com",
      address: "123 Test Street, Dhaka", zone: "inside" },
    p_payment_method: "cod",
    p_payment_reference: null,
    p_payment_sender: null,
    p_items: [{ slug: "sample-round-a", variant_colour: null, quantity: 1 }] });
check("rpc create_guest_order with an invalid phone returns a 4xx error (function validates)",
  badCreate.status >= 400 && badCreate.status < 500,
  `HTTP ${badCreate.status}, ${JSON.stringify(badCreate.data).slice(0, 120)}`);

// ---------------------------------------------------------------------------
// 5. S-3 payments — no direct anon access at all (migration 0004).
//    The payments table has RLS enabled and NO policies: anon SELECT
//    returns 0 rows and anon INSERT / UPDATE / DELETE is denied.
//    Payment status changes go ONLY through the SECURITY DEFINER
//    mark_order_payment_status function, probed below via /rpc/.
//    These checks run ONLY if the payments table exists; a 404
//    PGRST205 means migration 0004 has not been applied yet — the
//    checks are then recorded as blocked (not a crash) and the script
//    exits non-zero with a clear message.
// ---------------------------------------------------------------------------

const payments = await rest("GET", "payments?select=id,order_id");
if (isTableMissing(payments)) {
  const blocked = "blocked — migration 0004 has NOT been applied yet; apply it in the dashboard SQL editor, then re-run this script.";
  check("anon SELECT payments returns 200 with 0 rows (no policies — deny-by-default)", false, blocked);
  check("anon INSERT into payments is denied", false, blocked);
  check("anon UPDATE on payments is denied", false, blocked);
  check("anon DELETE on payments is denied", false, blocked);
  check("payments still has 0 rows after denied writes", false, blocked);
  check("rpc mark_order_payment_status returns not_found for an unknown reference", false, blocked);
  check("rpc create_guest_order with bkash + an invalid TrxID returns a 4xx error (function validates payment details)", false, blocked);
  const failedSoFar = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failedSoFar.length}/${results.length} checks passed.`);
  console.log("RESULT: FAIL — migration 0004 has NOT been applied yet (Section 5 blocked). Sections 1–4 passed; apply migration 0004, then re-run.");
  process.exit(1);
}
check("anon SELECT payments returns 200 with 0 rows (no policies — deny-by-default)",
  payments.status === 200 && Array.isArray(payments.data) && payments.data.length === 0,
  `HTTP ${payments.status}, ${Array.isArray(payments.data) ? payments.data.length : "?"} rows`);

await expectDenied("anon INSERT into payments is denied", "POST", "payments",
  { order_id: "00000000-0000-4000-8000-000000000000", method: "bkash",
    reference: "RLSPROBE1", sender_number: "01700000000",
    amount_bdt: 1, status: "pending" });

// No seeded payments rows exist, so UPDATE/DELETE target a filter that
// matches nothing: with no policies the operation returns 200 with 0
// rows changed (same PostgREST + RLS semantics as Section 2).
await expectDeniedWrite("anon UPDATE on payments is denied", "PATCH",
  "payments?order_id=eq.00000000-0000-4000-8000-000000000000", { status: "paid" });
await expectDeniedWrite("anon DELETE on payments is denied", "DELETE",
  "payments?order_id=eq.00000000-0000-4000-8000-000000000000");

// Sanity: the denied writes really did not land.
const paymentsAfter = await rest("GET", "payments?select=id");
check("payments still has 0 rows after denied writes",
  paymentsAfter.status === 200 && Array.isArray(paymentsAfter.data) && paymentsAfter.data.length === 0,
  `HTTP ${paymentsAfter.status}, ${Array.isArray(paymentsAfter.data) ? paymentsAfter.data.length : "?"} rows`);

// SECURITY DEFINER function: unknown reference -> not_found (the
// function exists and validates; no order state changes).
const markUnknown = await rest("POST", "rpc/mark_order_payment_status",
  { p_reference: "RB-2026-000000", p_status: "paid" });
check("rpc mark_order_payment_status returns not_found for an unknown reference",
  markUnknown.status === 200 && markUnknown.data &&
  markUnknown.data.ok === false && markUnknown.data.error === "not_found",
  `HTTP ${markUnknown.status}, data: ${JSON.stringify(markUnknown.data).slice(0, 120)}`);

// create with bkash + an INVALID TrxID must be rejected by the
// function's payment validation (4xx). Do NOT call it with valid
// data — that would create a real order (and decrement real stock).
const badTrx = await rest("POST", "rpc/create_guest_order",
  { p_customer: { name: "RLS probe", phone: "01700000000", email: "probe@example.com",
      address: "123 Test Street, Dhaka", zone: "inside" },
    p_payment_method: "bkash",
    p_payment_reference: "BAD",
    p_payment_sender: "01700000000",
    p_items: [{ slug: "sample-round-a", variant_colour: null, quantity: 1 }] });
check("rpc create_guest_order with bkash + an invalid TrxID returns a 4xx error (function validates payment details)",
  badTrx.status >= 400 && badTrx.status < 500,
  `HTTP ${badTrx.status}, ${JSON.stringify(badTrx.data).slice(0, 120)}`);

// ---------------------------------------------------------------------------
// 6. S-4 admin settings + non-admin JWT (migration 0005).
//    site_settings is public shop config (anon SELECT policy, 1 seeded
//    row); writes are admin-only. discount_codes + admins have NO
//    anon policy. is_admin() / am_i_admin() and every admin_* RPC
//    are EXECUTE-granted only to `authenticated` — the anon key
//    cannot call them at all (401/403/404), and a logged-in
//    NON-admin can call is_admin() but gets `false` back.
//    These checks run ONLY if the site_settings table exists; a 404
//    PGRST205 means migration 0005 has not been applied yet — the
//    checks are then recorded as blocked (not a crash) and the script
//    exits non-zero with a clear message.
// ---------------------------------------------------------------------------

const siteSettings = await rest("GET", "site_settings?select=id,tax_rate_percent,delivery_inside_fee_bdt,delivery_outside_fee_bdt");
if (isTableMissing(siteSettings)) {
  const blocked = "blocked — migration 0005 has NOT been applied yet; apply it in the dashboard SQL editor, then re-run this script.";
  check("anon SELECT site_settings returns 200 with exactly 1 seeded row (tax 5, delivery 60/120)", false, blocked);
  check("anon UPDATE on site_settings is denied", false, blocked);
  check("anon INSERT into site_settings is denied", false, blocked);
  check("anon DELETE on site_settings is denied", false, blocked);
  check("anon SELECT discount_codes returns 200 with 0 rows (no anon policy)", false, blocked);
  check("anon INSERT into discount_codes is denied", false, blocked);
  check("anon INSERT into admins is denied", false, blocked);
  check("anon rpc is_admin returns false or is not callable (anon learns nothing)", false, blocked);
  check("anon rpc admin_list_orders returns forbidden/empty (no order data leaks)", false, blocked);
  check("non-admin JWT: rpc is_admin returns false", false, blocked);
  check("non-admin JWT: UPDATE on products is denied", false, blocked);
  check("non-admin JWT: SELECT orders returns 0 rows", false, blocked);
  const failedSoFar = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failedSoFar.length}/${results.length} checks passed.`);
  console.log("RESULT: FAIL — migration 0005 has NOT been applied yet (Section 6 blocked). Sections 1–5 passed; apply migration 0005, then re-run.");
  process.exit(1);
}
check("anon SELECT site_settings returns 200 with exactly 1 seeded row (tax 5, delivery 60/120)",
  siteSettings.status === 200 && Array.isArray(siteSettings.data) && siteSettings.data.length === 1 &&
  siteSettings.data[0].id === 1 && siteSettings.data[0].tax_rate_percent === 5 &&
  siteSettings.data[0].delivery_inside_fee_bdt === 60 && siteSettings.data[0].delivery_outside_fee_bdt === 120,
  `HTTP ${siteSettings.status}, ${JSON.stringify(siteSettings.data).slice(0, 160)}`);

await expectDeniedWrite("anon UPDATE on site_settings is denied", "PATCH",
  "site_settings?id=eq.1", { tax_rate_percent: 99 });
await expectDenied("anon INSERT into site_settings is denied", "POST", "site_settings",
  { id: 1, tax_rate_percent: 99 });
await expectDeniedWrite("anon DELETE on site_settings is denied", "DELETE",
  "site_settings?id=eq.1");

const discountCodes = await rest("GET", "discount_codes?select=code");
check("anon SELECT discount_codes returns 200 with 0 rows (no anon policy)",
  discountCodes.status === 200 && Array.isArray(discountCodes.data) && discountCodes.data.length === 0,
  `HTTP ${discountCodes.status}, ${Array.isArray(discountCodes.data) ? discountCodes.data.length : "?"} rows`);

await expectDenied("anon INSERT into discount_codes is denied", "POST", "discount_codes",
  { code: "RLSPROBE", percent_off: 10, active: true });

await expectDenied("anon INSERT into admins is denied", "POST", "admins",
  { user_id: "00000000-0000-4000-8000-000000000000", role: "owner" });

// is_admin() is EXECUTE-granted only to `authenticated` (migration
// 0005 revokes PUBLIC), but live Supabase still answers an anon call
// with HTTP 200 + `false` (auth.uid() is null, so EXISTS is false).
// That is the safe answer — anon learns nothing except "I am not an
// admin" — so accept either not-callable (401/403/404) or `false`.
// The `false` case for a LOGGED-IN non-admin is proven by the JWT
// checks below.
const isAdminAnon = await rest("POST", "rpc/is_admin", {});
check("anon rpc is_admin returns false or is not callable (anon learns nothing)",
  [401, 403, 404].includes(isAdminAnon.status) ||
    (isAdminAnon.status === 200 && isAdminAnon.data === false),
  `HTTP ${isAdminAnon.status}, ${JSON.stringify(isAdminAnon.data).slice(0, 120)}`);

// Same for the admin RPCs: anon cannot execute them. Accept a
// 401/403/404, or — if a future grant ever exposes one — the
// function's own {ok:false, error:"forbidden"} or an empty array.
const listOrdersAnon = await rest("POST", "rpc/admin_list_orders",
  { p_status: null, p_limit: 1, p_offset: 0 });
const listOrdersForbidden =
  [401, 403, 404].includes(listOrdersAnon.status) ||
  (listOrdersAnon.data && listOrdersAnon.data.ok === false &&
    listOrdersAnon.data.error === "forbidden") ||
  (Array.isArray(listOrdersAnon.data) && listOrdersAnon.data.length === 0);
check("anon rpc admin_list_orders returns forbidden/empty (no order data leaks)",
  listOrdersForbidden,
  `HTTP ${listOrdersAnon.status}, ${JSON.stringify(listOrdersAnon.data).slice(0, 120)}`);

// --- The non-admin JWT test (closes the S-1 audit §5 open item) ---
// Sign up a throwaway user via the Auth API with the anon key, sign
// in, and use that JWT: is_admin() must return false, a product
// UPDATE must be denied, and SELECT orders must return 0 rows.
// The throwaway user CANNOT be deleted via the anon key — the owner
// deletes it in the dashboard (Authentication -> Users).
// If this project has email confirmation ON (the Supabase default),
// signup returns a user but no session, and sign-in fails with
// "Email not confirmed" — the checks are then recorded as blocked
// (not a crash) with instructions, instead of passing silently.

async function authApi(path, body, token) {
  const res = await fetch(`${url}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

async function restAsJwt(token, method, path, body) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
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

const jwtStamp = Date.now();
const probeEmail = `rls-test-${jwtStamp}@example.invalid`;
const probePassword = `RlsProbe${jwtStamp}!`;
let jwt = null;
let jwtBlockedReason = "";
const signup = await authApi("signup", {
  email: probeEmail,
  password: probePassword,
});
if (signup.status === 200 && signup.data && typeof signup.data.access_token === "string") {
  jwt = signup.data.access_token;
} else {
  const signin = await authApi("token?grant_type=password", {
    email: probeEmail,
    password: probePassword,
  });
  if (signin.status === 200 && signin.data && typeof signin.data.access_token === "string") {
    jwt = signin.data.access_token;
  } else {
    jwtBlockedReason = `signup HTTP ${signup.status} (no session returned) and sign-in HTTP ${signin.status} — ` +
      "this project has email confirmation ON, so the throwaway user cannot sign in until confirmed. " +
      "Turn OFF 'Confirm email' in the dashboard (Authentication -> Sign In / Providers -> Email), re-run, " +
      "then turn it back ON. (Creating the user in the dashboard does NOT help on its own: the script signs up " +
      "a fresh throwaway email on every run, so only the toggle — or a confirmed user whose credentials the " +
      "script knows — unblocks it.)";
  }
}

if (!jwt) {
  const blocked = `blocked — no JWT for the throwaway user: ${jwtBlockedReason}`;
  check("non-admin JWT: rpc is_admin returns false", false, blocked);
  check("non-admin JWT: UPDATE on products is denied", false, blocked);
  check("non-admin JWT: SELECT orders returns 0 rows", false, blocked);
  const failedSoFar = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failedSoFar.length}/${results.length} checks passed.`);
  console.log("RESULT: FAIL — non-admin JWT checks blocked (no JWT). The anon Section 6 checks passed; fix the confirmation issue above, then re-run.");
  process.exit(1);
}

const isAdminJwt = await restAsJwt(jwt, "POST", "rpc/is_admin", {});
check("non-admin JWT: rpc is_admin returns false",
  isAdminJwt.status === 200 && isAdminJwt.data === false,
  `HTTP ${isAdminJwt.status}, data: ${JSON.stringify(isAdminJwt.data).slice(0, 120)}`);

const jwtPatch = await restAsJwt(jwt, "PATCH", "products?slug=eq.sample-round-a", { price_bdt: 1 });
const jwtNoRows = jwtPatch.status === 200 && Array.isArray(jwtPatch.data) && jwtPatch.data.length === 0;
check("non-admin JWT: UPDATE on products is denied",
  jwtPatch.status === 401 || jwtPatch.status === 403 || jwtNoRows,
  `HTTP ${jwtPatch.status} (expected 401/403, or 200 with 0 rows changed)`);

const jwtOrders = await restAsJwt(jwt, "GET", "orders?select=id,reference");
check("non-admin JWT: SELECT orders returns 0 rows",
  jwtOrders.status === 200 && Array.isArray(jwtOrders.data) && jwtOrders.data.length === 0,
  `HTTP ${jwtOrders.status}, ${Array.isArray(jwtOrders.data) ? jwtOrders.data.length : "?"} rows`);

// Sign the throwaway user out. It cannot be deleted via the anon
// key — the owner deletes it in the dashboard (Authentication ->
// Users -> <probeEmail> -> Delete user).
await authApi("logout", {}, jwt);
console.log(`NOTE: throwaway user ${probeEmail} signed out. It cannot be deleted via the anon key — delete it in the Supabase dashboard (Authentication -> Users -> ${probeEmail} -> Delete user).`);

// ---------------------------------------------------------------------------
// Summary — 50 checks expected (24 S-1 + 7 S-2 + 7 S-3 + 12 S-4).
// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log("RESULT: FAIL — do NOT merge S-4 until every check passes.");
  process.exit(1);
}
console.log("RESULT: PASS — anon RLS contract holds for all 5 S-1 tables, for orders / order_items / order_status_events (S-2, no policies) and for payments (S-3, no policies — access only via SECURITY DEFINER functions), and for the S-4 admin tables (site_settings public-read-only, discount_codes + admins no anon access, admin RPCs authenticated-only) — and the non-admin JWT test (Section 6) proves a logged-in non-admin gets is_admin() = false, a denied product UPDATE and 0 order rows.");
console.log(
  "NOTE: the S-1 audit §5 non-admin-JWT open item is now covered " +
  "by Section 6 (when a JWT can be obtained — if email confirmation " +
  "blocks signup, the script records those 3 checks as blocked " +
  "instead of passing silently). A stronger negative test (insert " +
  "one inactive product as postgres in the dashboard, confirm anon " +
  "cannot see it, then delete it) is recommended once, by hand, " +
  "after this script passes.",
);
