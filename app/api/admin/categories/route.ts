import {
  adminClient,
  categorySaveSchema,
  requireAdmin,
  slugifyName,
} from "@/app/admin/(protected)/admin-data";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * POST /api/admin/categories — add a category (S-4, T-43).
 * requireAdmin() first. The slug is derived from the name and made
 * unique if needed. The new category stays hidden on the storefront
 * until it has ≥1 active product (listCategories enforces that).
 */
export async function POST(request: Request) {
  await requireAdmin();

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
  const supabase = await adminClient();
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
