import OrderStatusForm from "@/components/admin/order-status-form";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Order-status form refresh regression (S-4 fix, owner-found 2026-11-22).
 *
 * Bug: after a successful update the page refreshes with a new
 * allowedStatuses list, but useState does not re-initialise — the
 * form kept submitting the old status, so the second update in a
 * row (e.g. Processing -> Packed) silently re-saved the old status
 * and only a full page reload fixed it. The form now syncs its
 * selection whenever the allowed list changes.
 *
 * S-6 follow-up (D-S6-3, free movement): the lists are no longer
 * next-only — from Placed the admin may jump straight to Delivered
 * or step by step. The regression tests below are KEPT (the sync
 * matters even more now, because the list changes on every move),
 * and the list assertions are rewritten to the free rule.
 */

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded",
};

/** Free-movement lists, mirroring lib/order-status-targets.ts. */
const FREE_LISTS: Record<string, string[]> = {
  placed: [
    "confirmed",
    "processing",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ],
  confirmed: [
    "processing",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ],
  processing: [
    "confirmed",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ],
};

function renderForm(props: {
  currentStatus: string;
  allowedStatuses: string[];
}) {
  return render(
    <OrderStatusForm
      reference="RB-2026-123456"
      currentStatus={props.currentStatus}
      allowedStatuses={props.allowedStatuses}
      statusLabels={LABELS}
    />,
  );
}

function statusSelect() {
  return screen.getByLabelText("New status") as HTMLSelectElement;
}

function selectOptions() {
  return Array.from(statusSelect().options).map((option) => option.value);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("order status form offers the free-movement list", () => {
  it("from placed offers Confirmed through Delivered plus Cancelled (one jump to Delivered)", () => {
    renderForm({ currentStatus: "placed", allowedStatuses: FREE_LISTS.placed });
    expect(selectOptions()).toEqual(FREE_LISTS.placed);
    expect(statusSelect().value).toBe("confirmed");
  });

  it("from delivered offers only Returned", () => {
    renderForm({ currentStatus: "delivered", allowedStatuses: ["returned"] });
    expect(selectOptions()).toEqual(["returned"]);
    expect(statusSelect().value).toBe("returned");
  });

  it("from cancelled shows the no-further-changes text and no form", () => {
    renderForm({ currentStatus: "cancelled", allowedStatuses: [] });
    expect(
      screen.getByText(/no further status changes are available/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update status" }),
    ).not.toBeInTheDocument();
  });

  it("submits a free jump (Placed -> Delivered) in one update", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderForm({ currentStatus: "placed", allowedStatuses: FREE_LISTS.placed });
    fireEvent.change(statusSelect(), { target: { value: "delivered" } });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/orders/RB-2026-123456/status",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "delivered", note: null }),
        }),
      );
    });
  });
});

describe("order status form follows the allowed list after a refresh", () => {
  it("starts on the first allowed target status", () => {
    renderForm({
      currentStatus: "confirmed",
      allowedStatuses: FREE_LISTS.confirmed,
    });
    expect(statusSelect().value).toBe("processing");
  });

  it("keeps the admin's own choice while the allowed list is unchanged", () => {
    // Same array reference on rerender: in the real page the parent is
    // a server component, so this prop identity only changes when the
    // order's status actually changes (router.refresh after an update).
    const allowed = FREE_LISTS.confirmed;
    const { rerender } = renderForm({
      currentStatus: "confirmed",
      allowedStatuses: allowed,
    });
    fireEvent.change(statusSelect(), { target: { value: "cancelled" } });
    expect(statusSelect().value).toBe("cancelled");

    rerender(
      <OrderStatusForm
        reference="RB-2026-123456"
        currentStatus="confirmed"
        allowedStatuses={allowed}
        statusLabels={LABELS}
      />,
    );
    expect(statusSelect().value).toBe("cancelled");
  });

  it("moves to the new first allowed status after the order's status changes", () => {
    const { rerender } = renderForm({
      currentStatus: "confirmed",
      allowedStatuses: FREE_LISTS.confirmed,
    });
    expect(statusSelect().value).toBe("processing");

    // Free movement: from Processing the first target is now
    // Confirmed (a backward jump is allowed), not Packed.
    rerender(
      <OrderStatusForm
        reference="RB-2026-123456"
        currentStatus="processing"
        allowedStatuses={FREE_LISTS.processing}
        statusLabels={LABELS}
      />,
    );
    expect(statusSelect().value).toBe("confirmed");
  });

  it("submits the new status after the refresh, not the stale one", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderForm({
      currentStatus: "confirmed",
      allowedStatuses: FREE_LISTS.confirmed,
    });

    // The page refreshes after the first update: new status, new list.
    rerender(
      <OrderStatusForm
        reference="RB-2026-123456"
        currentStatus="processing"
        allowedStatuses={FREE_LISTS.processing}
        statusLabels={LABELS}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Update status" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/orders/RB-2026-123456/status",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "confirmed", note: null }),
        }),
      );
    });
    expect(refreshMock).toHaveBeenCalled();
  });
});

describe("the note is labelled customer-visible", () => {
  it("tells the admin the note goes to the customer", () => {
    renderForm({ currentStatus: "delivered", allowedStatuses: ["returned"] });
    expect(
      screen.getByText(/the customer will see this/i),
    ).toBeInTheDocument();
  });
});

describe("cancel still requires a reason", () => {
  it("blocks Cancel with an empty note and does not call the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderForm({ currentStatus: "placed", allowedStatuses: FREE_LISTS.placed });
    fireEvent.change(statusSelect(), { target: { value: "cancelled" } });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));

    expect(
      await screen.findByText("Enter a cancel reason."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits Cancel with the reason as the note", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderForm({ currentStatus: "placed", allowedStatuses: FREE_LISTS.placed });
    fireEvent.change(statusSelect(), { target: { value: "cancelled" } });
    fireEvent.change(
      screen.getByPlaceholderText("e.g. Customer asked to cancel"),
      { target: { value: "Customer asked to cancel" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/orders/RB-2026-123456/status",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            status: "cancelled",
            note: "Customer asked to cancel",
          }),
        }),
      );
    });
  });
});
