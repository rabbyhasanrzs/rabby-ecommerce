import CheckoutForm from "@/components/checkout-form";
import OrderConfirmationPage from "@/app/order/confirmation/page";
import OrdersPage from "@/app/orders/page";
import type { OrderDetail } from "@/lib/supabase/orders";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, clearBagMock, searchParamsHolder } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  clearBagMock: vi.fn(),
  searchParamsHolder: { value: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(searchParamsHolder.value),
}));

vi.mock("@/lib/bag-context", () => ({
  useBag: () => ({
    items: [
      {
        slug: "sample-round-a",
        name: "SAMPLE Round A",
        priceBdt: 950,
        variantColour: "Black",
        quantity: 2,
      },
      {
        slug: "sample-aviator-a",
        name: "SAMPLE Aviator A",
        priceBdt: 1200,
        variantColour: null,
        quantity: 1,
      },
    ],
    itemCount: 3,
    subtotalBdt: 3100,
    addItem: vi.fn(),
    removeItem: vi.fn(),
    setQuantity: vi.fn(),
    clearBag: clearBagMock,
    isDrawerOpen: false,
    openDrawer: vi.fn(),
    closeDrawer: vi.fn(),
  }),
}));

const fetchMock = vi.fn();

/**
 * The order the (mocked) API returns for the bkash journey: placed,
 * payment pending verification, TrxID stored. The sender number is
 * carried on the order but the pages never render it — only the TrxID.
 */
const BKASH_ORDER: OrderDetail = {
  reference: "RB-2026-123456",
  status: "placed",
  customerName: "Rabby Hasan",
  customerPhone: "01712345678",
  customerEmail: "rabby@example.com",
  deliveryAddress: "House 12, Road 5, Dhanmondi, Dhaka",
  deliveryZone: "inside",
  paymentMethod: "bkash",
  paymentStatus: "pending",
  paymentReference: "9A1B2C3D4E",
  paymentSender: "01712345678",
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
    {
      productSlug: "sample-aviator-a",
      productName: "SAMPLE Aviator A",
      variantColour: null,
      unitPriceBdt: 1200,
      quantity: 1,
      lineTotalBdt: 1200,
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

const CANCELLED_BKASH_ORDER: OrderDetail = {
  ...BKASH_ORDER,
  status: "cancelled",
  events: [
    ...BKASH_ORDER.events,
    {
      fromStatus: "placed",
      toStatus: "cancelled",
      createdAt: "2026-11-22T11:00:00Z",
    },
  ],
};

/** COD order with no S-3 payment fields (pre-S-3 fixture shape). */
const COD_ORDER: OrderDetail = {
  ...BKASH_ORDER,
  paymentMethod: "cod",
  paymentStatus: "cod",
  paymentReference: null,
  paymentSender: null,
};

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Rabby Hasan" },
  });
  fireEvent.change(screen.getByLabelText("Phone number"), {
    target: { value: "+8801712345678" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "rabby@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Delivery address"), {
    target: { value: "House 12, Road 5, Dhanmondi, Dhaka" },
  });
}

function trackOrder() {
  fireEvent.change(screen.getByLabelText("Order reference"), {
    target: { value: "RB-2026-123456" },
  });
  fireEvent.change(screen.getByLabelText("Phone number"), {
    target: { value: "01712345678" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Track order" }));
}

describe("payment journey (S-3, T-34 — API/page level, no browser E2E)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    sessionStorage.clear();
    searchParamsHolder.value = "";
  });

  it("bag → bkash checkout with TrxID → confirmation → track order → cancel before Shipped", async () => {
    // --- Step 1: bag → checkout (bkash + TrxID) ---
    // The first response is the mount-time GET /api/settings fetch
    // (S-4); the settings below are the demo-config values, so the
    // expected total (৳3,315) does not change.
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taxRatePercent: 5,
          deliveryInsideFeeBdt: 60,
          deliveryInsideEstimate: "1–2 days",
          deliveryOutsideFeeBdt: 120,
          deliveryOutsideEstimate: "3–5 days",
          paymentCodEnabled: true,
          paymentBkashEnabled: true,
          paymentNagadEnabled: true,
          paymentRocketEnabled: true,
          paymentCardEnabled: true,
          paymentOnlineEnabled: false,
          websiteNotice: "",
          supportWhatsapp: "",
          supportMessenger: "",
          supportPhone: "",
          supportEmail: "",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, items: [], issues: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          reference: "RB-2026-123456",
          totalBdt: 3315,
        }),
      });
    render(<CheckoutForm />);

    // The bag is visible in the order summary before checkout:
    // subtotal ৳3,100 + tax 5% (৳155) + delivery ৳60 = ৳3,315.
    expect(screen.getByText(/SAMPLE Round A/)).toBeInTheDocument();
    expect(screen.getByText("৳3,315")).toBeInTheDocument();

    fillValidForm();
    fireEvent.click(screen.getByLabelText(/^bKash/));
    fireEvent.change(screen.getByLabelText("Transaction ID (TrxID)"), {
      target: { value: "9A1B2C3D4E" },
    });
    fireEvent.change(screen.getByLabelText("Sender mobile number"), {
      target: { value: "01712345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/order/confirmation?ref=RB-2026-123456",
      );
    });
    const checkoutBody = JSON.parse(
      fetchMock.mock.calls[2]?.[1]?.body as string,
    );
    expect(checkoutBody.customer.paymentMethod).toBe("bkash");
    expect(checkoutBody.customer.paymentReference).toBe("9A1B2C3D4E");
    expect(checkoutBody.customer.paymentSender).toBe("01712345678");
    expect(clearBagMock).toHaveBeenCalled();
    expect(sessionStorage.getItem("rabby-order-phone")).toBe("01712345678");

    // --- Step 2: confirmation shows the TrxID + pending verification ---
    // Each step renders a different page — unmount the previous one so
    // queries (e.g. "bKash") match exactly one page.
    cleanup();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, order: BKASH_ORDER }),
    });
    searchParamsHolder.value = "ref=RB-2026-123456";
    render(<OrderConfirmationPage />);

    expect(
      await screen.findByText("Thank you — your order is placed."),
    ).toBeInTheDocument();
    expect(screen.getByText("RB-2026-123456")).toBeInTheDocument();
    expect(screen.getByText("bKash")).toBeInTheDocument();
    expect(screen.getByText("Payment pending verification")).toBeInTheDocument();
    expect(screen.getByText("Transaction ID")).toBeInTheDocument();
    expect(screen.getByText("9A1B2C3D4E")).toBeInTheDocument();
    // The sender number is never shown on the customer pages.
    expect(screen.queryByText("01712345678")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orders/lookup",
      expect.objectContaining({
        body: JSON.stringify({
          reference: "RB-2026-123456",
          phone: "01712345678",
        }),
      }),
    );

    // --- Step 3: track order shows the same TrxID + pending status ---
    cleanup();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, order: BKASH_ORDER }),
    });
    searchParamsHolder.value = "";
    render(<OrdersPage />);
    trackOrder();

    expect(
      await screen.findByText("Order RB-2026-123456"),
    ).toBeInTheDocument();
    expect(screen.getByText("Payment pending verification")).toBeInTheDocument();
    expect(screen.getByText("Transaction ID")).toBeInTheDocument();
    expect(screen.getByText("9A1B2C3D4E")).toBeInTheDocument();
    expect(screen.getByText("Order Placed")).toBeInTheDocument();

    // --- Step 4: cancel before Shipped restores stock ---
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, order: CANCELLED_BKASH_ORDER }),
      });
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(screen.getByText("Cancel this order?")).toBeInTheDocument();
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

  it("COD confirmation shows pay-on-delivery and no Transaction ID row", async () => {
    sessionStorage.setItem("rabby-order-phone", "01712345678");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, order: COD_ORDER }),
    });
    searchParamsHolder.value = "ref=RB-2026-123456";
    render(<OrderConfirmationPage />);

    expect(
      await screen.findByText("Thank you — your order is placed."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cash on Delivery — pay when your order arrives"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Transaction ID")).not.toBeInTheDocument();
  });
});
