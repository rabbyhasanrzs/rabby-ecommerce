import {
  adminClient,
  inventorySaveSchema,
} from "@/app/admin/(protected)/admin-data";
import { sendBackInStockAlertsForProduct } from "@/lib/order-email";
import {
  checkAdminAccess,
  getSupabaseAdminEnv,
} from "@/lib/supabase/admin";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * POST /api/admin/inventory — save one product's stock (S-4, T-44).
 * Writes products.stock_total, which the storefront reads on every
 * catalogue load — the change is visible to shoppers immediately.
 *
 * Auth failures are answered with JSON, never a redirect: this route
 * is called with fetch(), and a redirect would come back as the
 * login page's HTML — the client could not read it and would only
 * show the generic error. That is the 2026-11-22 inventory bug: a
 * failed save showed nothing but "Something went wrong. Please try
 * again.", hiding whether the session had ended, MFA was missing,
 * or the database write itself failed.
 */
export async function POST(request: Request) {
  if (!getSupabaseAdminEnv()) {
    // No Supabase configured (e.g. a build with no env vars): nobody
    // can be signed in — the same answer as a logged-out visit.
    return Response.json(
      {
        ok: false,
        error: "Your session ended. Please sign in again.",
        code: "unauthenticated",
      },
      { status: 401 },
    );
  }
  const supabase = await adminClient();
  const access = await checkAdminAccess(supabase);
  if (access.status !== "ok") {
    const error =
      access.status === "unauthenticated"
        ? "Your session ended. Please sign in again."
        : access.status === "forbidden"
          ? "This account is not an admin."
          : access.status === "mfa-missing"
            ? "Two-factor authentication is required. Please set it up first."
            : "Two-factor authentication is required. Please sign in again with your authenticator code.";
    return Response.json(
      { ok: false, error, code: access.status },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = inventorySaveSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Check the stock quantity.",
      },
      { status: 400 },
    );
  }

  // S-7 back-in-stock: the trigger needs the OLD stock — read the
  // row first. A 0 -> >0 crossing on an active product is the
  // restock event; anything else sends nothing.
  const { data: current, error: readError } = await supabase
    .from("products")
    .select("id,slug,name,stock_total,status")
    .eq("id", parsed.data.productId)
    .maybeSingle();
  if (readError) {
    console.error("Inventory save failed", {
      code: readError.code,
      message: readError.message,
      details: readError.details,
    });
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  if (!current) {
    return Response.json(
      { ok: false, error: "Product not found." },
      { status: 404 },
    );
  }
  const oldStock = (current as { stock_total: number }).stock_total;

  const { data, error } = await supabase
    .from("products")
    .update({ stock_total: parsed.data.stockTotal })
    .eq("id", parsed.data.productId)
    .select("id")
    .maybeSingle();
  if (error) {
    // Log the real database error server-side (Vercel logs keep it);
    // the admin still sees only the generic message.
    console.error("Inventory save failed", {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  if (!data) {
    return Response.json(
      { ok: false, error: "Product not found." },
      { status: 404 },
    );
  }

  // Back-in-stock trigger: a 0 -> >0 crossing on an ACTIVE product
  // alerts the pending subscribers. Best-effort and never throws —
  // the save already succeeded, and a failed send must never turn
  // it into a failed save. A save that does not cross zero, and a
  // restock of a deactivated product, send nothing (the rows stay
  // pending). A cancellation restoring stock does NOT trigger —
  // known gap in v1 (see the S-7 back-in-stock investigation note).
  if (
    oldStock <= 0 &&
    parsed.data.stockTotal > 0 &&
    (current as { status: string }).status === "active"
  ) {
    try {
      await sendBackInStockAlertsForProduct({
        productId: parsed.data.productId,
        productName: (current as { name: string }).name,
        productSlug: (current as { slug: string }).slug,
      });
    } catch {
      // Best-effort — the save already succeeded.
    }
  }
  return Response.json({ ok: true, id: parsed.data.productId });
}
