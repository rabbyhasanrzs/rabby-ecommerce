import CheckoutForm from "@/components/checkout-form";
import { checkoutRequestSchema } from "@/lib/api-schemas";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, clearBagMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  clearBagMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
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

// S-4: CheckoutForm fetches GET /api/settings on mount. Successful
// checkouts queue this settings response first so the later
// mockResolvedValueOnce values land on the validate / checkout calls
// in order. The settings below are the demo-config values, so the
// expected totals in these tests do not change.
const settingsResponse = {
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
};

/** No bag-validation or checkout call happened (the mount-time
 *  /api/settings fetch is allowed). */
function expectNoOrderCalls() {
  expect(
    fetchMock.mock.calls.filter(
      ([url]) => url === "/api/bag/validate" || url === "/api/checkout",
    ),
  ).toHaveLength(0);
}

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

function selectBkash() {
  fireEvent.click(screen.getByLabelText(/^bKash/));
}

function mockSuccessfulCheckout() {
  fetchMock
    .mockResolvedValueOnce(settingsResponse)
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
}

function checkoutBody() {
  return JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string);
}

describe("CheckoutForm payment details (S-3, demo-safe)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    sessionStorage.clear();
  });

  it("does not show TrxID / sender fields for COD (the default method)", () => {
    render(<CheckoutForm />);

    expect(
      screen.queryByLabelText("Transaction ID (TrxID)"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Sender mobile number"),
    ).not.toBeInTheDocument();
  });

  it("shows TrxID / sender fields for each mobile-banking method", () => {
    render(<CheckoutForm />);

    for (const label of [/^bKash/, /^Nagad/, /^Rocket/]) {
      fireEvent.click(screen.getByLabelText(label));
      expect(
        screen.getByLabelText("Transaction ID (TrxID)"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Sender mobile number"),
      ).toBeInTheDocument();
    }
  });

  it("does not show TrxID / sender fields for card", () => {
    render(<CheckoutForm />);

    fireEvent.click(screen.getByLabelText(/Debit \/ Credit Card/));
    expect(
      screen.queryByLabelText("Transaction ID (TrxID)"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Sender mobile number"),
    ).not.toBeInTheDocument();
  });

  it("submitting bkash without TrxID / sender shows inline errors and does not call fetch", async () => {
    render(<CheckoutForm />);
    fillValidForm();
    selectBkash();

    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    expect(
      await screen.findByText("Enter the Transaction ID from your payment."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter a valid Bangladeshi mobile number (01XXXXXXXXX).",
      ),
    ).toBeInTheDocument();
    expectNoOrderCalls();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("submitting bkash with a short TrxID shows the TrxID error only", async () => {
    render(<CheckoutForm />);
    fillValidForm();
    selectBkash();
    fireEvent.change(screen.getByLabelText("Transaction ID (TrxID)"), {
      target: { value: "ABC123" },
    });
    fireEvent.change(screen.getByLabelText("Sender mobile number"), {
      target: { value: "01712345678" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    expect(
      await screen.findByText("Enter the Transaction ID from your payment."),
    ).toBeInTheDocument();
    expectNoOrderCalls();
  });

  it("valid bkash submit sends paymentReference / paymentSender INSIDE customer", async () => {
    mockSuccessfulCheckout();
    render(<CheckoutForm />);
    fillValidForm();
    selectBkash();
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/settings");
    const body = checkoutBody();
    expect(body.customer.paymentMethod).toBe("bkash");
    expect(body.customer.paymentReference).toBe("9A1B2C3D4E");
    expect(body.customer.paymentSender).toBe("01712345678");
    // Regression (same rule as paymentMethod in S-2): payment details
    // live INSIDE customer, never at the top level.
    expect(body).not.toHaveProperty("paymentReference");
    expect(body).not.toHaveProperty("paymentSender");
    expect(checkoutRequestSchema.safeParse(body).success).toBe(true);
  });

  it("normalises a +880 sender number before sending", async () => {
    mockSuccessfulCheckout();
    render(<CheckoutForm />);
    fillValidForm();
    selectBkash();
    fireEvent.change(screen.getByLabelText("Transaction ID (TrxID)"), {
      target: { value: "9A1B2C3D4E" },
    });
    fireEvent.change(screen.getByLabelText("Sender mobile number"), {
      target: { value: "+8801712345678" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });
    expect(checkoutBody().customer.paymentSender).toBe("01712345678");
  });

  it("switching to COD clears the TrxID / sender fields", () => {
    render(<CheckoutForm />);
    selectBkash();
    fireEvent.change(screen.getByLabelText("Transaction ID (TrxID)"), {
      target: { value: "9A1B2C3D4E" },
    });
    fireEvent.change(screen.getByLabelText("Sender mobile number"), {
      target: { value: "01712345678" },
    });

    fireEvent.click(screen.getByLabelText(/Cash on Delivery/));

    expect(
      screen.queryByLabelText("Transaction ID (TrxID)"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Sender mobile number"),
    ).not.toBeInTheDocument();

    // Switching back shows empty fields — the stale values are gone.
    selectBkash();
    expect(screen.getByLabelText("Transaction ID (TrxID)")).toHaveValue("");
    expect(screen.getByLabelText("Sender mobile number")).toHaveValue("");
  });

  it("switching between mobile-banking methods keeps the entered details", () => {
    render(<CheckoutForm />);
    selectBkash();
    fireEvent.change(screen.getByLabelText("Transaction ID (TrxID)"), {
      target: { value: "9A1B2C3D4E" },
    });
    fireEvent.change(screen.getByLabelText("Sender mobile number"), {
      target: { value: "01712345678" },
    });

    fireEvent.click(screen.getByLabelText(/^Nagad/));

    expect(screen.getByLabelText("Transaction ID (TrxID)")).toHaveValue(
      "9A1B2C3D4E",
    );
    expect(screen.getByLabelText("Sender mobile number")).toHaveValue(
      "01712345678",
    );
  });

  it("card submit sends no payment details", async () => {
    mockSuccessfulCheckout();
    render(<CheckoutForm />);
    fillValidForm();
    fireEvent.click(screen.getByLabelText(/Debit \/ Credit Card/));

    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/order/confirmation?ref=RB-2026-123456",
      );
    });
    const body = checkoutBody();
    expect(body.customer.paymentMethod).toBe("card");
    // COD/card send no payment details at all — the keys are absent
    // (empty strings become undefined and JSON.stringify drops them).
    expect(body.customer).not.toHaveProperty("paymentReference");
    expect(body.customer).not.toHaveProperty("paymentSender");
    expect(checkoutRequestSchema.safeParse(body).success).toBe(true);
  });
});
