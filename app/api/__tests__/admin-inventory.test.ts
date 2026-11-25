/**
 * @vitest-environment node
 */
import { POST } from "@/app/api/admin/inventory/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminClientMock, checkAccessMock, getEnvMock, sendAlertsMock } =
  vi.hoisted(() => ({
    adminClientMock: vi.fn(),
    checkAccessMock: vi.fn(),
    getEnvMock: vi.fn(),
    sendAlertsMock: vi.fn(),
  }));

/**
 * Inventory route tests (S-6 follow-up — the 2026-11-22 inventory
 * bug): a failed save showed only "Something went wrong. Please try
 * again.", hiding the real reason. Auth failures must now come back
 * as JSON with the reason and a code — never a redirect, because
 * fetch() cannot use a login redirect. No network: mocked admin
 * gate + mocked Supabase client.
 *
 * S-7 back-in-stock: the route reads the old stock first, and a
 * 0 -> >0 crossing on an active product alerts the pending
 * subscribers (never failing the save). The alert send is mocked
 * here, not the network.
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
vi.mock("@/lib/order-email", () => ({
  sendBackInStockAlertsForProduct: sendAlertsMock,
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

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  stock_total: number;
  status: string;
};

type CurrentProduct = ProductRow | null;

function supabaseWithProduct(
  current: CurrentProduct,
  updateResult: {
    data: { id: string } | null;
    error: { code: string; message: string; details: string | null } | null;
  },
) {
  return {
    from: () => ({
      // The read before the update (S-7 trigger needs the old stock).
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: current, error: null }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: () => Promise.resolve(updateResult),
          }),
        }),
      }),
    }),
  };
}

const ACTIVE_PRODUCT: ProductRow = {
  id: PRODUCT_ID,
  slug: "sample-futuristic",
  name: "SAMPLE Futuristic A",
  stock_total: 10,
  status: "active",
};

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
      supabaseWithProduct(ACTIVE_PRODUCT, {
        data: { id: PRODUCT_ID },
        error: null,
      }),
    );
    sendAlertsMock.mockResolvedValue({ sent: 0, failed: 0, skipped: 0 });
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
      supabaseWithProduct(null, { data: null, error: null }),
    );
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 10 });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Product not found.");
  });

  it("returns 404 when the update matched nothing after the read", async () => {
    adminClientMock.mockResolvedValue(
      supabaseWithProduct(ACTIVE_PRODUCT, { data: null, error: null }),
    );
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 10 });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Product not found.");
  });

  it("returns 500 generic when the update errors, and logs the real error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    adminClientMock.mockResolvedValue(
      supabaseWithProduct(ACTIVE_PRODUCT, {
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

// ---------------------------------------------------------------------------
// Back-in-stock trigger (S-7): a 0 -> >0 crossing on an active product
// alerts the pending subscribers; anything else sends nothing.
// ---------------------------------------------------------------------------

describe("POST /api/admin/inventory back-in-stock trigger", () => {
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
    sendAlertsMock.mockResolvedValue({ sent: 2, failed: 0, skipped: 0 });
  });

  function withStock(oldStock: number, status = "active") {
    adminClientMock.mockResolvedValue(
      supabaseWithProduct(
        { ...ACTIVE_PRODUCT, stock_total: oldStock, status },
        { data: { id: PRODUCT_ID }, error: null },
      ),
    );
  }

  it("alerts on a 0 -> 5 crossing of an active product", async () => {
    withStock(0);
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 5 });
    expect(res.status).toBe(200);
    expect(sendAlertsMock).toHaveBeenCalledTimes(1);
    expect(sendAlertsMock).toHaveBeenCalledWith({
      productId: PRODUCT_ID,
      productName: "SAMPLE Futuristic A",
      productSlug: "sample-futuristic",
    });
  });

  it("does not alert on a 5 -> 8 save (no crossing)", async () => {
    withStock(5);
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 8 });
    expect(res.status).toBe(200);
    expect(sendAlertsMock).not.toHaveBeenCalled();
  });

  it("does not alert on a 0 -> 0 save (still out of stock)", async () => {
    withStock(0);
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 0 });
    expect(res.status).toBe(200);
    expect(sendAlertsMock).not.toHaveBeenCalled();
  });

  it("does not alert when the product is deactivated", async () => {
    withStock(0, "inactive");
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 5 });
    expect(res.status).toBe(200);
    expect(sendAlertsMock).not.toHaveBeenCalled();
  });

  it("still saves (200) when the alert send throws", async () => {
    withStock(0);
    sendAlertsMock.mockRejectedValue(new Error("Admin request failed"));
    const res = await postSave({ productId: PRODUCT_ID, stockTotal: 5 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: PRODUCT_ID });
  });
});
