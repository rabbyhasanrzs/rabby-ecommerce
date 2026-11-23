import {
  adminClient,
  categorySaveSchema,
} from "@/app/admin/(protected)/admin-data";
import {
  checkAdminAccess,
  getSupabaseAdminEnv,
} from "@/lib/supabase/admin";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * PATCH / DELETE /api/admin/categories/[id] (S-4, T-43).
 *
 * Auth failures are answered with JSON, never a redirect (same as
 * the inventory route, PR #26): these routes are called with
 * fetch(), and a redirect would come back as the login page's HTML.
 * PATCH renames the category (the slug stays as it was, so
 * storefront links never break). DELETE refuses with 409 when any
 * product still belongs to the category — the owner must move or
 * remove those products first.
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
      route: "PATCH /api/admin/categories/[id]",
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
  const parsed = categorySaveSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the category name.",
      },
      { status: 400 },
    );
  }
  const { data, error } = await supabase
    .from("categories")
    .update({ name: parsed.data.name })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  if (!data) {
    return Response.json(
      { ok: false, error: "Category not found." },
      { status: 404 },
    );
  }
  return Response.json({ ok: true, id });
}

export async function DELETE(
  _request: Request,
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
      route: "DELETE /api/admin/categories/[id]",
      code: access.status,
    });
    return Response.json(
      { ok: false, error, code: access.status },
      { status: 401 },
    );
  }
  const { id } = await params;

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id")
    .eq("category_id", id)
    .limit(1);
  if (productsError) {
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  if (products && products.length > 0) {
    return Response.json(
      {
        ok: false,
        error:
          "This category still has products. Move or remove them first.",
      },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) {
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  return Response.json({ ok: true, id });
}
