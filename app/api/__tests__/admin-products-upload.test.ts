/**
 * @vitest-environment node
 */
import { POST, sniffImageType } from "@/app/api/admin/products/upload/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminMock, adminClientMock, uploadMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  adminClientMock: vi.fn(),
  uploadMock: vi.fn(),
}));

/**
 * Upload route tests (S-6, T-61, S6-09) — mocked admin gate +
 * mocked Storage, no network. The magic-byte sniffing is the point:
 * a file that claims to be a PNG but is not one must be rejected
 * before anything is stored.
 */
vi.mock("@/app/admin/(protected)/admin-data", () => ({
  requireAdmin: requireAdminMock,
  adminClient: adminClientMock,
}));

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const TEXT_BYTES = new TextEncoder().encode(
  "<html><body>not an image</body></html>",
);

function postUpload(file: File): Promise<Response> {
  const formData = new FormData();
  formData.set("file", file);
  return POST(
    new Request("http://localhost/api/admin/products/upload", {
      method: "POST",
      body: formData,
    }),
  );
}

describe("sniffImageType", () => {
  it("sniffs JPEG, PNG and WebP from magic bytes", () => {
    expect(sniffImageType(JPEG_BYTES)).toBe("image/jpeg");
    expect(sniffImageType(PNG_BYTES)).toBe("image/png");
    expect(sniffImageType(WEBP_BYTES)).toBe("image/webp");
  });

  it("returns null for non-image bytes and truncated headers", () => {
    expect(sniffImageType(TEXT_BYTES)).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });
});

describe("POST /api/admin/products/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue(undefined);
    uploadMock.mockResolvedValue({ data: { path: "products/1-photo.jpg" }, error: null });
    adminClientMock.mockResolvedValue({
      storage: {
        from: () => ({
          upload: uploadMock,
          getPublicUrl: () => ({
            data: {
              publicUrl:
                "https://example.supabase.co/storage/v1/object/public/product-images/products/1-photo.jpg",
            },
          }),
        }),
      },
    });
  });

  it("uploads a real JPEG and stores the sniffed content type", async () => {
    const response = await postUpload(
      new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][2]).toEqual({
      contentType: "image/jpeg",
      upsert: false,
    });
  });

  it("rejects HTML bytes that claim to be a PNG", async () => {
    const response = await postUpload(
      new File([TEXT_BYTES], "photo.png", { type: "image/png" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "The file does not look like a JPEG, PNG or WebP photo.",
    });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a PNG whose claimed type is JPEG", async () => {
    const response = await postUpload(
      new File([PNG_BYTES], "photo.jpg", { type: "image/jpeg" }),
    );
    expect(response.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a JPEG whose extension says PNG", async () => {
    const response = await postUpload(
      new File([JPEG_BYTES], "photo.png", { type: "image/jpeg" }),
    );
    expect(response.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects a non-image claimed type before sniffing", async () => {
    const response = await postUpload(
      new File([TEXT_BYTES], "page.html", { type: "text/html" }),
    );
    expect(response.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
