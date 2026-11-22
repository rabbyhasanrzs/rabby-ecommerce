import {
  getBestSellers,
  getRevenueSeries,
  getSalesSummary,
} from "@/lib/admin-analytics";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Analytics data layer tests (S-4, T-47 / T-49).
 *
 * The admin RPCs are mocked — no network, no database. These tests
 * prove the mapping from the Slice A RPC shapes (migration 0005:
 * {day, revenue_bdt, orders}, {slug, name, qty, revenue_bdt},
 * {revenue_bdt, orders, avg_order_bdt}) to the camelCase shapes the
 * Analytics page and the Dashboard sparkline consume, plus the
 * empty-period handling (empty arrays / zeros — never invented
 * numbers) and the forbidden/error path.
 */

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(),
  createAdminClient: async () => ({ rpc: rpcMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRevenueSeries", () => {
  it("maps day/revenue_bdt/orders rows and calls admin_revenue_series with p_days", async () => {
    rpcMock.mockResolvedValue({
      data: [
        // The SQL returns a timestamp for the day; only the date is kept.
        { day: "2026-11-20T00:00:00", revenue_bdt: 1900, orders: 2 },
        { day: "2026-11-21T00:00:00", revenue_bdt: 0, orders: 0 },
        { day: "2026-11-22T00:00:00", revenue_bdt: 950, orders: 1 },
      ],
      error: null,
    });

    const series = await getRevenueSeries(7);

    expect(rpcMock).toHaveBeenCalledWith("admin_revenue_series", {
      p_days: 7,
    });
    expect(series).toEqual([
      { date: "2026-11-20", revenueBdt: 1900, orders: 2 },
      { date: "2026-11-21", revenueBdt: 0, orders: 0 },
      { date: "2026-11-22", revenueBdt: 950, orders: 1 },
    ]);
  });

  it("returns an empty array for an empty period (no invented numbers)", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    expect(await getRevenueSeries(30)).toEqual([]);
  });

  it("returns an empty array when the RPC returns null", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    expect(await getRevenueSeries(14)).toEqual([]);
  });

  it("throws a plain-words error when the RPC errors", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    await expect(getRevenueSeries(7)).rejects.toThrow(
      "Could not load sales data. Please try again.",
    );
  });

  it("throws when the RPC returns forbidden (non-admin)", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, error: "forbidden" },
      error: null,
    });

    await expect(getRevenueSeries(7)).rejects.toThrow(
      "Could not load sales data. Please try again.",
    );
  });
});

describe("getBestSellers", () => {
  it("maps slug/name/qty/revenue_bdt rows", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { slug: "sample-round-a", name: "Sample Round", qty: 3, revenue_bdt: 2850 },
        { slug: "sample-aviator-b", name: "Sample Aviator", qty: 1, revenue_bdt: 1200 },
      ],
      error: null,
    });

    const sellers = await getBestSellers(14);

    expect(rpcMock).toHaveBeenCalledWith("admin_best_sellers", {
      p_days: 14,
    });
    expect(sellers).toEqual([
      { slug: "sample-round-a", name: "Sample Round", qty: 3, revenueBdt: 2850 },
      { slug: "sample-aviator-b", name: "Sample Aviator", qty: 1, revenueBdt: 1200 },
    ]);
  });

  it("returns an empty array for an empty period", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    expect(await getBestSellers(7)).toEqual([]);
  });
});

describe("getSalesSummary", () => {
  it("maps revenue_bdt/orders/avg_order_bdt", async () => {
    rpcMock.mockResolvedValue({
      data: { revenue_bdt: 4750, orders: 4, avg_order_bdt: 1188 },
      error: null,
    });

    expect(await getSalesSummary(30)).toEqual({
      revenueBdt: 4750,
      orders: 4,
      avgOrderBdt: 1188,
    });
    expect(rpcMock).toHaveBeenCalledWith("admin_sales_summary", {
      p_days: 30,
    });
  });

  it("returns zeros when there are no orders (avg 0, not NaN)", async () => {
    rpcMock.mockResolvedValue({
      data: { revenue_bdt: 0, orders: 0, avg_order_bdt: 0 },
      error: null,
    });

    expect(await getSalesSummary(7)).toEqual({
      revenueBdt: 0,
      orders: 0,
      avgOrderBdt: 0,
    });
  });

  it("returns zeros when the RPC returns null", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    expect(await getSalesSummary(7)).toEqual({
      revenueBdt: 0,
      orders: 0,
      avgOrderBdt: 0,
    });
  });
});
