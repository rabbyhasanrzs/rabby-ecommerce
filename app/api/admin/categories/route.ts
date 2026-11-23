import {
  adminClient,
  categorySaveSchema,
  slugifyName,
} from "@/app/admin/(protected)/admin-data";
import {
  checkAdminAccess,
  getSupabaseAdminEnv,
} from "@/lib/supabase/admin";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * POST /api/admin/categories — add a category (S-4, T-43).
 *
 * Auth failures are answered with JSON, never a redirect (same as
 * the inventory route, PR #26): this route is called with fetch(),
 * and a redirect would come back as the login page's HTML. The slug
 * is derived from the name and made unique if needed. The new
 * category stays hidden on the storefront until it has ≥1 active
 * product (listCategories enforces that).
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
    // Log the failure server-side (route + code only, no user data);
    // the admin sees the plain-words message above.
    console.error("Admin API auth failed", {
      route: "POST /api/admin/categories",
      code: access.status,
    });
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
  const { data: maxRow } = await supabase
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const sortOrder =
    ((maxRow as { sort_order: number }[] | null)?.[0]?.sort_order ?? -1) + 1;

  let slug = slugifyName(parsed.data.name);
  if (slug === "") {
    slug = "category";
  }
  let candidate = slug;
  let attempt = 2;
  for (;;) {
    const { data } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) {
      slug = candidate;
      break;
    }
    candidate = `${slug}-${attempt}`;
    attempt += 1;
    if (attempt > 100) {
      return Response.json(
        { ok: false, error: "Could not find a free URL for this category." },
        { status: 500 },
      );
    }
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      slug,
      name: parsed.data.name,
      sort_order: sortOrder,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) {
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  return Response.json({ ok: true, id: (data as { id: string }).id }, { status: 201 });
}
