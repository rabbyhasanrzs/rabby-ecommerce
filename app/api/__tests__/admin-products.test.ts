/**
 * @vitest-environment node
 */
import { POST as createProduct } from "@/app/api/admin/products/route";
import { PATCH as updateProduct } from "@/app/api/admin/products/[id]/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminClientMock, checkAccessMock, getEnvMock } = vi.hoisted(() => ({
  adminClientMock: vi.fn(),
  checkAccessMock: vi.fn(),
  getEnvMock: vi.fn(),
}));

/**
 * Products routes tests (S-6 follow-up — same hidden-error class
 * as the inventory save bug, PR #26): auth failures must come back
 * as 401 JSON with the reason and a code — never a redirect,
 * because fetch() cannot use a login redirect. No network: mocked
 * admin gate + mocked Supabase client. The auth check runs before
 * the body is read, so the unauthenticated tests need no valid
 * product body.
 */
vi.mock("@/app/admin/(protected)/admin-data", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/app/admin/(protected)/admin-data")>();
  return { ...original, adminClient: adminClientMock };
});
vi.mock("@/lib/supabase/admin", () => ({
  checkAdminAccess: checkAccessMock,
  getSupabaseAdminEnv: getEnvMock,
  // Never called by these routes, but admin-data imports them — keep
  // the mocked module complete so importOriginal above cannot fail.
  createAdminClient: vi.fn(),
  requireAdmin: vi.fn(),
}));

const PRODUCT_ID = "123e4567-e89b-12d3-a456-426614174000";

function postCreate(body: unknown): Promise<Response> {
  return createProduct(
    new Request("http://localhost/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function patchProduct(body: unknown): Promise<Response> {
  return updateProduct(
    new Request(`http://localhost/api/admin/products/${PRODUCT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PRODUCT_ID }) },
  );
}

describe("POST /api/admin/products", () => {
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
  });

  it("answers 401 JSON with the reason when the session ended — never a redirect", async () => {
    checkAccessMock.mockResolvedValue({ status: "unauthenticated", user: null });
    const res = await postCreate({ name: "Test" });
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
    const res = await postCreate({ name: "Test" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("mfa-required");
    expect(body.error).toContain("Two-factor authentication");
  });

  it("answers 401 JSON when Supabase is not configured", async () => {
    getEnvMock.mockReturnValue(null);
    const res = await postCreate({ name: "Test" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthenticated");
  });
});

describe("PATCH /api/admin/products/[id]", () => {
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
  });

  it("answers 401 JSON with the reason when the session ended — never a redirect", async () => {
    checkAccessMock.mockResolvedValue({ status: "unauthenticated", user: null });
    const res = await patchProduct({ name: "Test" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: false,
      error: "Your session ended. Please sign in again.",
      code: "unauthenticated",
    });
  });
});
