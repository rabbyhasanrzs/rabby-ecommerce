/**
 * @vitest-environment node
 */
import { POST } from "@/app/api/admin/inventory/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminClientMock, checkAccessMock, getEnvMock } = vi.hoisted(
  () => ({
    adminClientMock: vi.fn(),
    checkAccessMock: vi.fn(),
    getEnvMock: vi.fn(),
  }),
);

/**
 * Inventory route tests (S-6 follow-up — the 2026-11-22 inventory
 * bug): a failed save showed only "Something went wrong. Please try
 * again.", hiding the real reason. Auth failures must now come back
 * as JSON with the reason and a code — never a redirect, because
 * fetch() cannot use a login redirect. No network: mocked admin
 * gate + mocked Supabase client.
 */
vi.mock("@/app/admin/(protected)/admin-data", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/app/admin/(protected)/admin-data")>();
  return { ...original, adminClient: adminClientMock };
});
vi.mock("@/lib/supabase/admin", () => ({
  checkAdminAccess: checkAccessMock,
  getSupabaseAdminEnv: getEnvMock,
  // Never called by this route, but admin-data imports them — keep
  // the mocked module complete so importOriginal above cannot fail.
  createAdminClient: vi.fn(),
  requireAdmin: vi.fn(),
}));

const PRODUCT_ID = "123e4567-e89b-12d3-a456-426614174000";

function postSave(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/admin/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function supabaseWithUpdate(result: {
  data: { id: string } | null;
  error: { code: string; message: string; details: string | null } | null;
}) {
  return {
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: () => Promise.resolve(result),
          }),
        }),
      }),
    }),
  };
}

describe("POST /api/admin/inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvMock.mockReturnValue({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    checkAccessMock.mockResolvedValue({
      status: "ok",
      user: { id: "admin-id" },
    });
    adminClientMock.mockResolvedValue(
      supabaseWithUpdate({ data: { id: PRODUCT_ID }, error: null }),
    );
  });

  it("saves stock and returns the product id", async () => {
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 10 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: PRODUCT_ID });
  });

  it("answers 401 JSON with the reason when the session ended — never a redirect", async () => {
    checkAccessMock.mockResolvedValue({ status: "unauthenticated", user: null });
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 10 });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: false,
      error: "Your session ended. Please sign in again.",
      code: "unauthenticated",
    });
  });

  it("answers 401 JSON with mfa-required when the MFA code step is missing", async () => {
    checkAccessMock.mockResolvedValue({ status: "mfa-required", user: null });
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 10 });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("mfa-required");
    expect(body.error).toContain("Two-factor authentication");
  });

  it("answers 401 JSON when Supabase is not configured", async () => {
    getEnvMock.mockReturnValue(null);
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 10 });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthenticated");
  });

  it("returns 400 for a negative stock value", async () => {
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: -1 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Stock cannot be negative.");
  });

  it("returns 404 when no product matched", async () => {
    adminClientMock.mockResolvedValue(
      supabaseWithUpdate({ data: null, error: null }),
    );
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 10 });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Product not found.");
  });

  it("returns 500 generic when the update errors, and logs the real error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    adminClientMock.mockResolvedValue(
      supabaseWithUpdate({
        data: null,
        error: {
          code: "42501",
          message: "permission denied for table products",
          details: null,
        },
      }),
    );
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 10 });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something went wrong. Please try again.");
    expect(errorSpy).toHaveBeenCalledWith(
      "Inventory save failed",
      expect.objectContaining({ code: "42501" }),
    );
    errorSpy.mockRestore();
  });
});
