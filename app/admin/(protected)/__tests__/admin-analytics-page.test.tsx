import AdminAnalyticsPage from "@/app/admin/(protected)/analytics/page";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin Analytics page tests (S-6 follow-up — Date.now() unstable-value
 * errors). This page was one of only two admin pages with no
 * connection() call: requireAdmin() reads the session with
 * supabase.auth.getUser(), and @supabase/auth-js checks the token
 * expiry with Date.now() on every such call, which Next 16 (Cache
 * Components) flags as an unstable value during prerendering. The
 * page must call await connection() BEFORE requireAdmin().
 */

const { connectionMock, requireAdminMock } = vi.hoisted(() => ({
  connectionMock: vi.fn(async () => undefined),
  requireAdminMock: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("next/server", () => ({
  connection: connectionMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/admin-analytics", () => ({
  getRevenueSeries: async () => [],
  getBestSellers: async () => [],
  getSalesSummary: async () => ({
    revenueBdt: 0,
    orders: 0,
    avgOrderBdt: 0,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("AdminAnalyticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sales and revenue heading", async () => {
    render(
      await AdminAnalyticsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(
      screen.getByRole("heading", { name: "Sales & Revenue" }),
    ).toBeInTheDocument();
  });

  it("calls connection() before requireAdmin()", async () => {
    render(
      await AdminAnalyticsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(connectionMock).toHaveBeenCalled();
    expect(requireAdminMock).toHaveBeenCalled();
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireAdminMock.mock.invocationCallOrder[0],
    );
  });
});
