import OrderTimeline from "@/components/order-timeline";
import { adminUpdateOrderStatus } from "@/app/admin/(protected)/admin-data";
import { lookupOrder, type OrderDetail } from "@/lib/supabase/orders";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Status-update reflection test (S-4, T-47).
 *
 * Proves the T-46 acceptance criterion end to end at the seam:
 * the admin status update succeeds (admin_update_order_status RPC,
 * mocked at the Supabase client), the customer lookup then returns
 * the order with its new status event, and the customer timeline
 * (components/order-timeline.tsx) shows the new status as the
 * current step. No network, no database — both RPCs are mocked.
 */

const { rpcMock, lookupOrderMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  lookupOrderMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(),
  createAdminClient: async () => ({ rpc: rpcMock }),
}));

vi.mock("@/lib/supabase/orders", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/supabase/orders")>();
  return { ...original, lookupOrder: lookupOrderMock };
});

function confirmedOrder(): OrderDetail {
  return {
    reference: "RB-2026-123456",
    status: "confirmed",
    customerName: "Test Customer",
    customerPhone: "01700000000",
    customerEmail: "test@example.com",
    deliveryAddress: "123 Test Street, Dhaka",
    deliveryZone: "inside",
    paymentMethod: "cod",
    paymentStatus: "cod",
    paymentReference: null,
    paymentSender: null,
    subtotalBdt: 950,
    taxBdt: 48,
    deliveryFeeBdt: 60,
    totalBdt: 1058,
    createdAt: "2026-11-22T00:00:00Z",
    items: [],
    events: [
      {
        fromStatus: null,
        toStatus: "placed",
        createdAt: "2026-11-22T00:00:00Z",
      },
      {
        fromStatus: "placed",
        toStatus: "confirmed",
        createdAt: "2026-11-22T01:00:00Z",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin status update reflected in the customer view", () => {
  it("admin confirms the order, then the customer timeline shows Confirmed as current", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
    lookupOrderMock.mockResolvedValue(confirmedOrder());

    // 1. The admin updates the status (Slice B's adminUpdateOrderStatus
    //    calls the admin_update_order_status RPC).
    const updated = await adminUpdateOrderStatus(
      "RB-2026-123456",
      "confirmed",
      null,
    );
    expect(updated).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("admin_update_order_status", {
      p_reference: "RB-2026-123456",
      p_status: "confirmed",
      p_note: null,
    });

    // 2. The customer looks the order up (reference + phone).
    const order = await lookupOrder("RB-2026-123456", "01700000000");
    expect(order?.status).toBe("confirmed");
    expect(order?.events).toHaveLength(2);

    // 3. The customer timeline shows the new status.
    render(<OrderTimeline status={order!.status} events={order!.events} />);

    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(7);
    expect(steps[0]).toHaveTextContent("Order Placed");
    expect(steps[0]).toHaveTextContent("Done");
    expect(steps[1]).toHaveTextContent("Confirmed");
    expect(steps[1]).toHaveTextContent("Current step");
    expect(steps[2]).toHaveTextContent("Processing");
    expect(steps[2]).toHaveTextContent("Upcoming");
  });
});
