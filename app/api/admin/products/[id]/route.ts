import {
  adminClient,
  productSaveSchema,
} from "@/app/admin/(protected)/admin-data";
import {
  checkAdminAccess,
  getSupabaseAdminEnv,
} from "@/lib/supabase/admin";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * PATCH /api/admin/products/[id] — edit a product (S-4, T-42).
 *
 * Auth failures are answered with JSON, never a redirect (same as
 * the inventory route, PR #26): this route is called with fetch(),
 * and a redirect would come back as the login page's HTML. Same
 * validation as create. Updates the product row, the (single)
 * variant colour, and the primary photo — a new photo URL replaces
 * the existing primary image row; when no new photo was uploaded
 * the form sends the existing URL back, so the photo is untouched.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    // Log the failure server-side (route + code only, no user data);
    // the admin sees the plain-words message above.
    console.error("Admin API auth failed", {
      route: "PATCH /api/admin/products/[id]",
      code: access.status,
    });
    return Response.json(
      { ok: false, error, code: access.status },
      { status: 401 },
    );
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = productSaveSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the product details.",
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (existingError) {
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  if (!existing) {
    return Response.json(
      { ok: false, error: "Product not found." },
      { status: 404 },
    );
  }

  const { error: productError } = await supabase
    .from("products")
    .update({
      name: input.name,
      description: input.description || null,
      category_id: input.categoryId,
      price_bdt: input.priceBdt,
      stock_total: input.stockTotal,
      status: input.status,
    })
    .eq("id", id);
  if (productError) {
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }

  // Variant: update the first variant's colour, or add one if the
  // product has none yet.
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", id)
    .order("sort_order", { ascending: true })
    .limit(1);
  const firstVariant = (variants as { id: string }[] | null)?.[0];
  if (firstVariant) {
    // S-6 (T-61, S6-14): the old code awaited this update without
    // checking the result — a failed colour write was silently
    // ignored while the product update above had already succeeded.
    const { error: variantUpdateError } = await supabase
      .from("product_variants")
      .update({ colour: input.colour })
      .eq("id", firstVariant.id);
    if (variantUpdateError) {
      return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
    }
  } else {
    const { error: variantInsertError } = await supabase
      .from("product_variants")
      .insert({
        product_id: id,
        colour: input.colour,
        price_bdt: null,
        stock_quantity: null,
        sort_order: 0,
      });
    if (variantInsertError) {
      return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
    }
  }

  // Photo: replace the primary image row when the URL changed, or
  // add one when the product had no photo.
  const { data: images } = await supabase
    .from("product_images")
    .select("id,storage_path")
    .eq("product_id", id)
    .eq("is_primary", true)
    .order("sort_order", { ascending: true })
    .limit(1);
  const primary = (images as { id: string; storage_path: string }[] | null)?.[0];
  if (primary) {
    if (primary.storage_path !== input.imageUrl) {
      const { error: imageError } = await supabase
        .from("product_images")
        .update({ storage_path: input.imageUrl, alt_text: input.name })
        .eq("id", primary.id);
      if (imageError) {
        return Response.json(
          { ok: false, error: GENERIC_ERROR },
          { status: 500 },
        );
      }
    }
  } else {
    const { error: imageError } = await supabase
      .from("product_images")
      .insert({
        product_id: id,
        storage_path: input.imageUrl,
        alt_text: input.name,
        sort_order: 0,
        is_primary: true,
      });
    if (imageError) {
      return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
    }
  }

  return Response.json({ ok: true, id });
}
