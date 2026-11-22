/**
 * @vitest-environment node
 */
import { GET } from "@/app/api/health/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

/**
 * Health route tests (S-6 monitoring): the public /api/health check
 * must answer 200 when the database answers and 503 when it does
 * not — never a throw, never a secret. No network: mocked admin
 * client (the same module the existing API tests mock).
 */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

// connection() is a Next request-time marker — in tests it is a no-op;
// NextResponse stays real via importOriginal.
vi.mock("next/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("next/server")>();
  return { ...original, connection: vi.fn().mockResolvedValue(undefined) };
});

function supabaseWithHealthRead(result: {
  data: { id: number }[] | null;
  error: { message: string } | null;
}) {
  return {
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve(result),
      }),
    }),
  };
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockResolvedValue(
      supabaseWithHealthRead({ data: [{ id: 1 }], error: null }),
    );
  });

  it("answers 200 with ok status when the database answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 503 with degraded status when the database errors", async () => {
    createAdminClientMock.mockResolvedValue(
      supabaseWithHealthRead({
        data: null,
        error: { message: "permission denied for table site_settings" },
      }),
    );
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "error" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 503 with degraded status when Supabase is not configured", async () => {
    createAdminClientMock.mockRejectedValue(
      new Error("Supabase is not configured"),
    );
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "error" });
  });
});
