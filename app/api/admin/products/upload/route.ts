import {
  adminClient,
  requireAdmin,
} from "@/app/admin/(protected)/admin-data";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/admin/products/upload — product photo upload (S-4, T-42).
 *
 * requireAdmin() first. Accepts one multipart file field ("file"),
 * JPEG/PNG/WebP up to 5 MB, uploads it to the `product-images`
 * Storage bucket (created by migration 0005) and returns the public
 * URL. The product form stores that URL in product_images — the
 * storefront renders it with a plain <img> (CSP already allows
 * https://*.supabase.co images). No file is ever stored in the repo.
 */
export async function POST(request: Request) {
  await requireAdmin();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, error: "Choose a photo to upload." },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json(
      { ok: false, error: "Only JPEG, PNG or WebP photos are accepted." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { ok: false, error: "The photo must be 5 MB or smaller." },
      { status: 400 },
    );
  }

  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const path = `products/${Date.now()}-${safeName || "photo"}`;
  const supabase = await adminClient();
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return Response.json(
      {
        ok: false,
        error:
          "The photo could not be uploaded. Photo storage may not be set up yet — run migration 0005 first.",
      },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage
    .from("product-images")
    .getPublicUrl(path);
  return Response.json({ ok: true, url: urlData.publicUrl });
}
