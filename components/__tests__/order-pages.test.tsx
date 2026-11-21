import OrderConfirmationPage from "@/app/order/confirmation/page";
import OrdersPage from "@/app/orders/page";
import type { OrderDetail } from "@/lib/supabase/orders";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchParamsHolder = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParamsHolder.value),
}));

const fetchMock = vi.fn();

const PLACED_ORDER: OrderDetail = {
  reference: "RB-2026-123456",
  status: "placed",
  customerName: "Rabby Hasan",
  customerPhone: "01712345678",
  customerEmail: "rabby@example.com",
  deliveryAddress: "House 12, Road 5, Dhanmondi, Dhaka",
  deliveryZone: "inside",
  paymentMethod: "cod",
  subtotalBdt: 3100,
  taxBdt: 155,
  deliveryFeeBdt: 60,
  totalBdt: 3315,
  createdAt: "2026-11-22T10:00:00Z",
  items: [
    {
      productSlug: "sample-round-a",
      productName: "SAMPLE Round A",
      variantColour: "Black",
      unitPriceBdt: 950,
      quantity: 2,
      lineTotalBdt: 1900,
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

const CANCELLED_ORDER: OrderDetail = {
  ...PLACED_ORDER,
  status: "cancelled",
  events: [
    ...PLACED_ORDER.events,
    {
      fromStatus: "placed",
      toStatus: "cancelled",
      createdAt: "2026-11-22T11:00:00Z",
    },
  ],
};

describe("OrderConfirmationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    sessionStorage.clear();
    searchParamsHolder.value = "ref=RB-2026-123456";
  });

  it("renders the reference, totals and Track link from the saved phone", async () => {
    sessionStorage.setItem("rabby-order-phone", "01712345678");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, order: PLACED_ORDER }),
    });
    render(<OrderConfirmationPage />);

    expect(
      await screen.findByText("Thank you — your order is placed."),
    ).toBeInTheDocument();
    expect(screen.getByText("RB-2026-123456")).toBeInTheDocument();
    expect(screen.getByText(/SAMPLE Round A/)).toBeInTheDocument();
    expect(screen.getByText("৳3,315")).toBeInTheDocument();
    expect(screen.getByText(/Inside Dhaka — 1–2 days/)).toBeInTheDocument();
    expect(screen.getByText("Cash on Delivery")).toBeInTheDocument();
    const trackLink = screen.getByRole("link", { name: "Track Your Order" });
    expect(trackLink).toHaveAttribute(
      "href",
      "/orders?ref=RB-2026-123456",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orders/lookup",
      expect.objectContaining({
        body: JSON.stringify({
          reference: "RB-2026-123456",
          phone: "01712345678",
        }),
      }),
    );
  });

  it("asks for the phone number when none was saved", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, order: PLACED_ORDER }),
    });
    render(<OrderConfirmationPage />);

    expect(
      await screen.findByLabelText(
        "Enter the phone number used for this order",
      ),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Enter the phone number used for this order"),
      { target: { value: "01712345678" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Show my order" }));

    expect(await screen.findByText("RB-2026-123456")).toBeInTheDocument();
  });

  it("shows the not-found message when the lookup fails", async () => {
    sessionStorage.setItem("rabby-order-phone", "01712345678");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: "not_found" }),
    });
    render(<OrderConfirmationPage />);

    expect(
      await screen.findByText(
        "Order not found. Check the reference and phone number and try again.",
      ),
    ).toBeInTheDocument();
  });
});

describe("OrdersPage (track order)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    searchParamsHolder.value = "";
  });

  it("lookup renders the order detail and timeline", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, order: PLACED_ORDER }),
    });
    render(<OrdersPage />);

    fireEvent.change(screen.getByLabelText("Order reference"), {
      target: { value: "RB-2026-123456" },
    });
    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "01712345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Track order" }));

    expect(
      await screen.findByText("Order RB-2026-123456"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rabby Hasan")).toBeInTheDocument();
    expect(screen.getByText(/SAMPLE Round A/)).toBeInTheDocument();
    expect(screen.getByText("৳3,315")).toBeInTheDocument();
    expect(screen.getByText("Order Placed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel order" }),
    ).toBeInTheDocument();
  });

  it("prefills the reference from ?ref=", () => {
    searchParamsHolder.value = "ref=RB-2026-123456";
    render(<OrdersPage />);

    expect(screen.getByLabelText("Order reference")).toHaveValue(
      "RB-2026-123456",
    );
  });

  it("cancel flow asks for confirmation, then shows the cancelled message", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, order: PLACED_ORDER }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, order: CANCELLED_ORDER }),
      });
    render(<OrdersPage />);

    fireEvent.change(screen.getByLabelText("Order reference"), {
      target: { value: "RB-2026-123456" },
    });
    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "01712345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Track order" }));
    await screen.findByText("Order RB-2026-123456");

    // Step 1: the inline confirm.
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(screen.getByText("Cancel this order?")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Step 2: confirm, then the cancelled message + refreshed timeline.
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    expect(
      await screen.findByText("Order cancelled. Stock has been restored."),
    ).toBeInTheDocument();
    expect(screen.getByText("This order was cancelled.")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/orders/cancel");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("a too-late cancel shows the shipped message", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, order: PLACED_ORDER }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false, error: "too_late" }),
      });
    render(<OrdersPage />);

    fireEvent.change(screen.getByLabelText("Order reference"), {
      target: { value: "RB-2026-123456" },
    });
    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "01712345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Track order" }));
    await screen.findByText("Order RB-2026-123456");

    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    expect(
      await screen.findByText(
        "This order has already shipped and can no longer be cancelled.",
      ),
    ).toBeInTheDocument();
  });
});
