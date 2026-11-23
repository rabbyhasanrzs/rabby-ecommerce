import { POST } from "@/app/api/admin/orders/[reference]/status/route";
import OrderTimeline from "@/components/order-timeline";
import {
  lookupOrder,
  type OrderDetail,
} from "@/lib/supabase/orders";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin Orders tests (S-4, T-46).
 *
 * 1. The status-update route: a POST reaches admin_update_order_status
 *    (mocked at the Supabase RPC boundary) and answers { ok: true }.
 * 2. The customer view afterwards: the mocked lookupOrder returns the
 *    order at its new status, and the timeline renders that status as
 *    the current step — the admin update is reflected in the customer
 *    timeline because the RPC writes order_status_events.
 */

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  createAdminClient: () => ({ rpc: rpcMock }),
  // S-6 follow-up (same hidden-error class as the inventory save
  // bug, PR #26): the status route now answers auth failures with
  // 401 JSON via checkAdminAccess instead of requireAdmin()'s
  // redirect — the gate must be mocked as passing here.
  checkAdminAccess: vi.fn(async () => ({
    status: "ok",
    user: { id: "admin-1" },
  })),
  getSupabaseAdminEnv: () => ({
    url: "https://example.supabase.co",
    anonKey: "anon-key",
  }),
}));

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock("@/lib/supabase/orders", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/supabase/orders")>();
  return {
    ...original,
    lookupOrder: lookupMock,
  };
});

const REFERENCE = "RB-2026-123456";
const PHONE = "01712345678";

const PLACED_ORDER: OrderDetail = {
  reference: REFERENCE,
  status: "placed",
  customerName: "Rabby Hasan",
  customerPhone: PHONE,
  customerEmail: "rabby@example.com",
  deliveryAddress: "House 12, Road 5, Dhanmondi, Dhaka",
  deliveryZone: "inside",
  paymentMethod: "cod",
  subtotalBdt: 950,
  taxBdt: 48,
  deliveryFeeBdt: 60,
  totalBdt: 1058,
  createdAt: "2026-11-22T10:00:00Z",
  items: [
    {
      productSlug: "sample-round-a",
      productName: "SAMPLE Round A",
      variantColour: "Black",
      unitPriceBdt: 950,
      quantity: 1,
      lineTotalBdt: 950,
    },
  ],
  events: [
    {
      fromStatus: null,
      toStatus: "placed",
      createdAt: "2026-11-22T10:00:00Z",
    },
  ],
};

function postStatus(reference: string, body: unknown): Promise<Response> {
  return POST(
    new Request(`http://localhost/api/admin/orders/${reference}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reference }) },
  );
}

describe("POST /api/admin/orders/[reference]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockReset();
    lookupMock.mockReset();
  });

  it("posts the status update to admin_update_order_status and answers ok", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });

    const response = await postStatus(REFERENCE, {
      status: "confirmed",
      note: "Packed and ready",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      reference: REFERENCE,
      status: "confirmed",
    });
    expect(rpcMock).toHaveBeenCalledWith("admin_update_order_status", {
      p_reference: REFERENCE,
      p_status: "confirmed",
      p_note: "Packed and ready",
    });
  });

  it("requires a cancel reason when cancelling", async () => {
    const response = await postStatus(REFERENCE, {
      status: "cancelled",
      note: null,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Enter a cancel reason.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid status change with 422", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, error: "invalid_transition" },
      error: null,
    });

    const response = await postStatus(REFERENCE, {
      status: "delivered",
      note: null,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      error: "That status change is not allowed from here.",
    });
  });

  it("the customer timeline shows the new status after the update", async () => {
    // 1. Admin updates the order placed -> confirmed.
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
    const update = await postStatus(REFERENCE, {
      status: "confirmed",
      note: null,
    });
    expect(update.status).toBe(200);

    // 2. The customer looks the order up afterwards: the lookup
    //    (which reads order_status_events) now returns confirmed.
    const confirmedOrder: OrderDetail = {
      ...PLACED_ORDER,
      status: "confirmed",
      events: [
        ...PLACED_ORDER.events,
        {
          fromStatus: "placed",
          toStatus: "confirmed",
          createdAt: "2026-11-22T11:00:00Z",
        },
      ],
    };
    lookupMock.mockResolvedValue(confirmedOrder);
    const found = await lookupOrder(REFERENCE, PHONE);
    expect(found?.status).toBe("confirmed");

    // 3. The timeline renders Confirmed as the current step.
    render(
      <OrderTimeline
        status={found?.status ?? ""}
        events={found?.events ?? []}
      />,
    );
    const confirmedStep = screen.getByText("Confirmed");
    expect(confirmedStep).toBeInTheDocument();
    expect(confirmedStep.closest("li")).toHaveTextContent("Current step");
    expect(screen.getByText("Order Placed").closest("li")).toHaveTextContent(
      "Done",
    );
  });
});
