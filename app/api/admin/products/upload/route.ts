import {
  adminClient,
  requireAdmin,
} from "@/app/admin/(protected)/admin-data";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Sniff the real image format from magic bytes (S-6, T-61, S6-09).
 * `file.type` is browser-set and trivially spoofable with a crafted
 * multipart request, so the claimed MIME is never trusted on its own.
 * Returns the sniffed MIME, or null when the bytes match no known
 * image format.
 */
export function sniffImageType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

const EXTENSIONS_BY_TYPE: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

/**
 * POST /api/admin/products/upload — product photo upload (S-4, T-42).
 *
 * requireAdmin() first. Accepts one multipart file field ("file"),
 * JPEG/PNG/WebP up to 5 MB, uploads it to the `product-images`
 * Storage bucket (created by migration 0005) and returns the public
 * URL. The product form stores that URL in product_images — the
 * storefront renders it with a plain <img> (CSP already allows
 * https://*.supabase.co images). No file is ever stored in the repo.
 *
 * The claimed MIME is never trusted: the format is sniffed from
 * magic bytes (S-6, T-61, S6-09) and the stored contentType is the
 * sniffed one.
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

  // S-6 (T-61, S6-09): sniff the real format from magic bytes and
  // require it to agree with the claimed type — a mislabelled file
  // (e.g. HTML renamed to .png with type image/png) is rejected.
  // The extension must match the sniffed format too.
  const sniffedType = sniffImageType(
    new Uint8Array(await file.arrayBuffer()),
  );
  if (!sniffedType || sniffedType !== file.type) {
    return Response.json(
      {
        ok: false,
        error: "The file does not look like a JPEG, PNG or WebP photo.",
      },
      { status: 400 },
    );
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!EXTENSIONS_BY_TYPE[sniffedType].includes(extension)) {
    return Response.json(
      {
        ok: false,
        error: "The photo's file extension does not match its format.",
      },
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
      // Store the sniffed type, not the client-claimed one (S-6, S6-09).
      contentType: sniffedType,
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
