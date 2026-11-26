import CheckoutForm from "@/components/checkout-form";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, clearBagMock, assignMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  clearBagMock: vi.fn(),
  assignMock: vi.fn(),
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

const GATEWAY_URL =
  "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=TEST";

/**
 * CheckoutForm — Pay Online (S-7).
 *
 * The gateway itself is never contacted here: fetch is routed by
 * URL (settings / bag validate / checkout), and the redirect is a
 * full-page navigation (window.location.assign), not router.push —
 * the gateway is a different site.
 */

function settingsResponse(paymentOnlineEnabled: boolean) {
  return {
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
      paymentOnlineEnabled,
      websiteNotice: "",
      supportWhatsapp: "",
      supportMessenger: "",
      supportPhone: "",
      supportEmail: "",
    }),
  };
}

function routeFetch(paymentOnlineEnabled: boolean) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/settings") {
      return settingsResponse(paymentOnlineEnabled);
    }
    if (url === "/api/bag/validate") {
      return { ok: true, json: async () => ({ ok: true, items: [], issues: [] }) };
    }
    if (url === "/api/checkout") {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          reference: "RB-2026-123456",
          totalBdt: 3315,
          gatewayUrl: GATEWAY_URL,
        }),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  });
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

describe("CheckoutForm — Pay Online (S-7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    sessionStorage.clear();
    // The redirect is a full-page navigation; stub it so the test
    // can observe it without leaving jsdom.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: assignMock },
    });
  });

  it("offers Pay Online when the owner switched it on", async () => {
    routeFetch(true);
    render(<CheckoutForm />);

    expect(
      await screen.findByLabelText(/^Pay Online/),
    ).toBeInTheDocument();
  });

  it("hides Pay Online when the owner switched it off", async () => {
    routeFetch(false);
    render(<CheckoutForm />);

    await screen.findByLabelText(/^Cash on Delivery/);
    expect(screen.queryByLabelText(/^Pay Online/)).not.toBeInTheDocument();
  });

  it("placing an online order clears the bag and redirects to the gateway page (not router.push)", async () => {
    routeFetch(true);
    render(<CheckoutForm />);

    fireEvent.click(await screen.findByLabelText(/^Pay Online/));
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(GATEWAY_URL);
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(clearBagMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("rabby-order-phone")).toBe("01712345678");
    // The checkout body carries the online method.
    const checkoutCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/checkout",
    );
    expect(checkoutCall).toBeDefined();
    const checkoutBody = JSON.parse(checkoutCall?.[1]?.body as string);
    expect(checkoutBody.customer.paymentMethod).toBe("online");
  });

  it("a failed online checkout shows the plain-words error and keeps the bag", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/settings") {
        return settingsResponse(true);
      }
      if (url === "/api/bag/validate") {
        return {
          ok: true,
          json: async () => ({ ok: true, items: [], issues: [] }),
        };
      }
      if (url === "/api/checkout") {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            ok: false,
            error:
              "Online payment is not available right now. Please choose another payment method.",
            reference: "RB-2026-123456",
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    render(<CheckoutForm />);

    fireEvent.click(await screen.findByLabelText(/^Pay Online/));
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    expect(
      await screen.findByText(
        "Online payment is not available right now. Please choose another payment method.",
      ),
    ).toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(clearBagMock).not.toHaveBeenCalled();
  });
});
