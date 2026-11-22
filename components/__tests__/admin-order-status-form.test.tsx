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
  cancelled: "Cancelled",
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("order status form follows the allowed list after a refresh", () => {
  it("starts on the first allowed next status", () => {
    renderForm({
      currentStatus: "confirmed",
      allowedStatuses: ["processing", "cancelled"],
    });
    expect(statusSelect().value).toBe("processing");
  });

  it("keeps the admin's own choice while the allowed list is unchanged", () => {
    // Same array reference on rerender: in the real page the parent is
    // a server component, so this prop identity only changes when the
    // order's status actually changes (router.refresh after an update).
    const allowed = ["processing", "cancelled"];
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
      allowedStatuses: ["processing", "cancelled"],
    });
    expect(statusSelect().value).toBe("processing");

    rerender(
      <OrderStatusForm
        reference="RB-2026-123456"
        currentStatus="processing"
        allowedStatuses={["packed", "cancelled"]}
        statusLabels={LABELS}
      />,
    );
    expect(statusSelect().value).toBe("packed");
  });

  it("submits the new status after the refresh, not the stale one", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderForm({
      currentStatus: "confirmed",
      allowedStatuses: ["processing", "cancelled"],
    });

    // The page refreshes after the first update: new status, new list.
    rerender(
      <OrderStatusForm
        reference="RB-2026-123456"
        currentStatus="processing"
        allowedStatuses={["packed", "cancelled"]}
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
          body: JSON.stringify({ status: "packed", note: null }),
        }),
      );
    });
    expect(refreshMock).toHaveBeenCalled();
  });
});
