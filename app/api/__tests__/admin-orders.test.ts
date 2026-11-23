/**
 * @vitest-environment node
 */
import { POST as updatePayment } from "@/app/api/admin/orders/[reference]/payment/route";
import { POST as updateStatus } from "@/app/api/admin/orders/[reference]/status/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminClientMock,
  checkAccessMock,
  getEnvMock,
  updateOrderStatusMock,
  updatePaymentStatusMock,
} = vi.hoisted(() => ({
  adminClientMock: vi.fn(),
  checkAccessMock: vi.fn(),
  getEnvMock: vi.fn(),
  updateOrderStatusMock: vi.fn(),
  updatePaymentStatusMock: vi.fn(),
}));

/**
 * Order admin routes tests (S-6 follow-up — same hidden-error class
 * as the inventory save bug, PR #26): auth failures must come back
 * as 401 JSON with the reason and a code — never a redirect,
 * because fetch() cannot use a login redirect. No network: mocked
 * admin gate + mocked RPC helpers. The auth check runs before the
 * body is read, so the unauthenticated tests need no valid body.
 */
vi.mock("@/app/admin/(protected)/admin-data", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/app/admin/(protected)/admin-data")>();
  return {
    ...original,
    adminClient: adminClientMock,
    adminUpdateOrderStatus: updateOrderStatusMock,
    adminUpdatePaymentStatus: updatePaymentStatusMock,
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  checkAdminAccess: checkAccessMock,
  getSupabaseAdminEnv: getEnvMock,
  // Never called by these routes, but admin-data imports them — keep
  // the mocked module complete so importOriginal above cannot fail.
  createAdminClient: vi.fn(),
  requireAdmin: vi.fn(),
}));

const REFERENCE = "RB-123456";

function postStatus(body: unknown): Promise<Response> {
  return updateStatus(
    new Request(`http://localhost/api/admin/orders/${REFERENCE}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reference: REFERENCE }) },
  );
}

function postPayment(body: unknown): Promise<Response> {
  return updatePayment(
    new Request(`http://localhost/api/admin/orders/${REFERENCE}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reference: REFERENCE }) },
  );
}

describe("POST /api/admin/orders/[reference]/status", () => {
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
    const res = await postStatus({ status: "confirmed" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: false,
      error: "Your session ended. Please sign in again.",
      code: "unauthenticated",
    });
    expect(updateOrderStatusMock).not.toHaveBeenCalled();
  });

  it("answers 401 JSON with forbidden when the account is not an admin", async () => {
    checkAccessMock.mockResolvedValue({ status: "forbidden", user: null });
    const res = await postStatus({ status: "confirmed" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("forbidden");
    expect(body.error).toBe("This account is not an admin.");
  });
});

describe("POST /api/admin/orders/[reference]/payment", () => {
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
    const res = await postPayment({ status: "paid" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: false,
      error: "Your session ended. Please sign in again.",
      code: "unauthenticated",
    });
    expect(updatePaymentStatusMock).not.toHaveBeenCalled();
  });
});
