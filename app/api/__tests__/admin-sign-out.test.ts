/**
 * @vitest-environment node
 */
import { POST } from "@/app/api/admin/sign-out/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminClientMock, checkAccessMock, getEnvMock, signOutMock } =
  vi.hoisted(() => ({
    adminClientMock: vi.fn(),
    checkAccessMock: vi.fn(),
    getEnvMock: vi.fn(),
    signOutMock: vi.fn(),
  }));

/**
 * Sign-out route tests (S-6 follow-up — same hidden-error class as
 * the inventory save bug, PR #26): auth failures must come back as
 * 401 JSON with the reason and a code — never a redirect, because
 * fetch() cannot use a login redirect. No network: mocked admin
 * gate + mocked Supabase client. The sign-out button already reads
 * a 401 JSON body (session-timeout kind), so this shape is what the
 * client expects.
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

function postSignOut(): Promise<Response> {
  return POST();
}

describe("POST /api/admin/sign-out", () => {
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
    signOutMock.mockResolvedValue({ error: null });
    adminClientMock.mockResolvedValue({
      auth: { signOut: signOutMock },
    });
  });

  it("signs out and returns ok for a verified admin", async () => {
    const res = await postSignOut();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("answers 401 JSON with the reason when the session ended — never a redirect", async () => {
    checkAccessMock.mockResolvedValue({ status: "unauthenticated", user: null });
    const res = await postSignOut();
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: false,
      error: "Your session ended. Please sign in again.",
      code: "unauthenticated",
    });
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("answers 401 JSON when Supabase is not configured", async () => {
    getEnvMock.mockReturnValue(null);
    const res = await postSignOut();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthenticated");
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
