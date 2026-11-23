/**
 * @vitest-environment node
 */
import { POST as createCategory } from "@/app/api/admin/categories/route";
import {
  DELETE as deleteCategory,
  PATCH as updateCategory,
} from "@/app/api/admin/categories/[id]/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminClientMock, checkAccessMock, getEnvMock } = vi.hoisted(() => ({
  adminClientMock: vi.fn(),
  checkAccessMock: vi.fn(),
  getEnvMock: vi.fn(),
}));

/**
 * Categories routes tests (S-6 follow-up — same hidden-error class
 * as the inventory save bug, PR #26): auth failures must come back
 * as 401 JSON with the reason and a code — never a redirect,
 * because fetch() cannot use a login redirect. No network: mocked
 * admin gate + mocked Supabase client. The auth check runs before
 * the body is read, so the unauthenticated tests need no valid
 * category body.
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

const CATEGORY_ID = "123e4567-e89b-12d3-a456-426614174000";

function setupAuthOk() {
  getEnvMock.mockReturnValue({
    url: "https://example.supabase.co",
    anonKey: "anon-key",
  });
  checkAccessMock.mockResolvedValue({
    status: "ok",
    user: { id: "admin-id" },
  });
}

function postCreate(body: unknown): Promise<Response> {
  return createCategory(
    new Request("http://localhost/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function patchCategory(body: unknown): Promise<Response> {
  return updateCategory(
    new Request(`http://localhost/api/admin/categories/${CATEGORY_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: CATEGORY_ID }) },
  );
}

function removeCategory(): Promise<Response> {
  return deleteCategory(
    new Request(`http://localhost/api/admin/categories/${CATEGORY_ID}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: CATEGORY_ID }) },
  );
}

describe("POST /api/admin/categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthOk();
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
});

describe("PATCH /api/admin/categories/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthOk();
  });

  it("answers 401 JSON with the reason when the session ended — never a redirect", async () => {
    checkAccessMock.mockResolvedValue({ status: "unauthenticated", user: null });
    const res = await patchCategory({ name: "Test" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Your session ended. Please sign in again.",
      code: "unauthenticated",
    });
  });
});

describe("DELETE /api/admin/categories/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthOk();
  });

  it("answers 401 JSON with the reason when the session ended — never a redirect", async () => {
    checkAccessMock.mockResolvedValue({ status: "unauthenticated", user: null });
    const res = await removeCategory();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Your session ended. Please sign in again.",
      code: "unauthenticated",
    });
  });
});
