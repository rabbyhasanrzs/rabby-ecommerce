import {
  adminClient,
  productSaveSchema,
  requireAdmin,
  slugifyName,
} from "@/app/admin/(protected)/admin-data";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * POST /api/admin/products — create a product (S-4, T-42).
 *
 * requireAdmin() first; the body is validated with the same
 * productSaveSchema the form uses (price > 0, stock present, photo
 * URL present). The save writes three rows so the product appears on
 * the storefront at once: the product row (is_demo = false — an
 * admin-added product is real), one variant row for the colour, and
 * one product_images row for the uploaded photo (is_primary).
 * The slug is derived from the name and made unique if needed.
 */
export async function POST(request: Request) {
  await requireAdmin();

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
  const supabase = await adminClient();

  // Unique slug from the name (sample-round-a, sample-round-a-2, …).
  let slug = slugifyName(input.name);
  if (slug === "") {
    slug = "product";
  }
  let candidate = slug;
  let attempt = 2;
  for (;;) {
    const { data } = await supabase
      .from("products")
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
        { ok: false, error: "Could not find a free URL for this product." },
        { status: 500 },
      );
    }
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      slug,
      name: input.name,
      description: input.description || null,
      category_id: input.categoryId,
      price_bdt: input.priceBdt,
      stock_total: input.stockTotal,
      status: input.status,
      is_demo: false,
    })
    .select("id")
    .single();
  if (productError || !product) {
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  const productId = (product as { id: string }).id;

  const { error: variantError } = await supabase
    .from("product_variants")
    .insert({
      product_id: productId,
      colour: input.colour,
      price_bdt: null,
      stock_quantity: null,
      sort_order: 0,
    });
  if (variantError) {
    // S-6 (T-61, S6-14): a later-step failure must not leave a
    // half-created product (row with no variant/photo). Remove the
    // product row and report the failure; the fuller fix is a
    // single-transaction RPC.
    await supabase.from("products").delete().eq("id", productId);
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }

  const { error: imageError } = await supabase.from("product_images").insert({
    product_id: productId,
    storage_path: input.imageUrl,
    alt_text: input.name,
    sort_order: 0,
    is_primary: true,
  });
  if (imageError) {
    // Same as above: no orphan product row without its photo.
    await supabase.from("products").delete().eq("id", productId);
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }

  return Response.json({ ok: true, id: productId, slug }, { status: 201 });
}
