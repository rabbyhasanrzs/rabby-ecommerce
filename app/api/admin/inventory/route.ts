import {
  adminClient,
  inventorySaveSchema,
  requireAdmin,
} from "@/app/admin/(protected)/admin-data";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * POST /api/admin/inventory — save one product's stock (S-4, T-44).
 * requireAdmin() first. Writes products.stock_total, which the
 * storefront reads on every catalogue load — the change is visible
 * to shoppers immediately.
 */
export async function POST(request: Request) {
  await requireAdmin();

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

  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("products")
    .update({ stock_total: parsed.data.stockTotal })
    .eq("id", parsed.data.productId)
    .select("id")
    .maybeSingle();
  if (error) {
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  if (!data) {
    return Response.json(
      { ok: false, error: "Product not found." },
      { status: 404 },
    );
  }
  return Response.json({ ok: true, id: parsed.data.productId });
}
