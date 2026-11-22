import {
  AdminDashboardPageContent,
} from "@/app/admin/(protected)/page";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin Dashboard tests (S-4, T-41). The admin client + analytics
 * are mocked at the module boundary (no network, no database):
 * the RPC returns canned dashboard stats and the revenue series is
 * canned per test.
 */

const { rpcMock, revenueMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  revenueMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  createAdminClient: () => ({ rpc: rpcMock }),
}));

vi.mock("@/lib/admin-analytics", () => ({
  getRevenueSeries: revenueMock,
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined),
}));

const STATS = {
  orders_to_fulfil: 3,
  low_stock_count: 2,
  new_orders_7d: 5,
  recent_orders: [
    {
      id: "o1",
      reference: "RB-2026-123456",
      customer_name: "Rabby Hasan",
      customer_phone: "01712345678",
      customer_email: "rabby@example.com",
      address: "House 12, Road 5, Dhanmondi, Dhaka",
      zone: "inside",
      payment_method: "cod",
      payment_status: "cod",
      payment_reference: null,
      total_bdt: 3315,
      status: "placed",
      created_at: "2026-11-22T10:00:00Z",
    },
  ],
  low_stock: [
    { slug: "sample-round-a", name: "SAMPLE Round A", stock_total: 1 },
  ],
};

const EMPTY_SERIES = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-11-${16 + i}`,
  revenueBdt: 0,
  orders: 0,
}));

const LIVE_SERIES = [
  { date: "2026-11-16", revenueBdt: 0, orders: 0 },
  { date: "2026-11-17", revenueBdt: 1900, orders: 2 },
  { date: "2026-11-18", revenueBdt: 950, orders: 1 },
  { date: "2026-11-19", revenueBdt: 0, orders: 0 },
  { date: "2026-11-20", revenueBdt: 2850, orders: 3 },
  { date: "2026-11-21", revenueBdt: 0, orders: 0 },
  { date: "2026-11-22", revenueBdt: 1200, orders: 1 },
];

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: STATS, error: null });
  });

  it("renders the summary cards from the mocked stats, each linking on", async () => {
    revenueMock.mockResolvedValue(EMPTY_SERIES);
    render(await AdminDashboardPageContent());

    expect(screen.getByText("Orders to fulfil")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Low stock/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("New orders (7 days)")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Orders to fulfil/ }),
    ).toHaveAttribute("href", "/admin/orders");
    expect(
      screen.getByRole("link", { name: /Low stock/ }),
    ).toHaveAttribute("href", "/admin/inventory");
    expect(
      screen.getByRole("heading", { name: "Low stock" }),
    ).toBeInTheDocument();
    expect(screen.getByText("RB-2026-123456")).toBeInTheDocument();
    expect(screen.getByText("৳3,315")).toBeInTheDocument();
    expect(screen.getByText("SAMPLE Round A")).toBeInTheDocument();
    expect(screen.getByText("Only 1 left")).toBeInTheDocument();
  });

  it("shows the sparkline empty state when the 7-day series is all zeros", async () => {
    revenueMock.mockResolvedValue(EMPTY_SERIES);
    render(await AdminDashboardPageContent());

    expect(screen.getByText("No orders yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /Revenue over the last 7 days/ }),
    ).not.toBeInTheDocument();
  });

  it("draws the sparkline when the series has revenue", async () => {
    revenueMock.mockResolvedValue(LIVE_SERIES);
    render(await AdminDashboardPageContent());

    expect(screen.queryByText("No orders yet")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Revenue over the last 7 days/ }),
    ).toBeInTheDocument();
  });
});
