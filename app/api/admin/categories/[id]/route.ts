import {
  adminClient,
  categorySaveSchema,
  requireAdmin,
} from "@/app/admin/(protected)/admin-data";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * PATCH / DELETE /api/admin/categories/[id] (S-4, T-43).
 * requireAdmin() first. PATCH renames the category (the slug stays
 * as it was, so storefront links never break). DELETE refuses with
 * 409 when any product still belongs to the category — the owner
 * must move or remove those products first.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
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
  const supabase = await adminClient();
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
  await requireAdmin();
  const { id } = await params;
  const supabase = await adminClient();

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
