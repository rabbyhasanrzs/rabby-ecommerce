import CheckoutForm from "@/components/checkout-form";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Checkout payment-method filtering (S-4 fix, owner-found 2026-11-22).
 *
 * Bug: the checkout form rendered the static demo-config payment
 * list and never looked at the admin settings flags, so a method
 * the owner switched off in Settings (e.g. Rocket) still showed
 * at checkout. The form now offers only the enabled methods once
 * settings arrive; while settings load (or the fetch fails) every
 * method is offered, so checkout is never blocked on settings.
 */

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
    ],
    itemCount: 2,
    subtotalBdt: 1900,
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

function settingsResponse(overrides: Record<string, unknown> = {}) {
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
      paymentOnlineEnabled: false,
      websiteNotice: "",
      supportWhatsapp: "",
      supportMessenger: "",
      supportPhone: "",
      supportEmail: "",
      ...overrides,
    }),
  };
}

function radio(label: RegExp) {
  return screen.queryByLabelText(label) as HTMLInputElement | null;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

describe("CheckoutForm payment methods follow the admin settings", () => {
  it("hides Rocket when the owner switched it off, keeps the other mobile-banking methods", async () => {
    fetchMock.mockResolvedValueOnce(
      settingsResponse({ paymentRocketEnabled: false }),
    );
    render(<CheckoutForm />);

    await waitFor(() => {
      expect(radio(/^Rocket/)).not.toBeInTheDocument();
    });
    expect(radio(/^bKash/)).toBeInTheDocument();
    expect(radio(/^Nagad/)).toBeInTheDocument();
    expect(radio(/Cash on Delivery/)).toBeInTheDocument();
    expect(radio(/Debit \/ Credit Card/)).toBeInTheDocument();
    // The Mobile Banking group stays — bKash and Nagad are still offered.
    expect(
      screen.getByText("Mobile Banking", { selector: "legend" }),
    ).toBeInTheDocument();
  });

  it("moves the selection to the first offered method when the selected one is switched off", async () => {
    fetchMock.mockResolvedValueOnce(
      settingsResponse({ paymentCodEnabled: false }),
    );
    render(<CheckoutForm />);

    await waitFor(() => {
      expect(radio(/Cash on Delivery/)).not.toBeInTheDocument();
    });
    expect(radio(/^bKash/)?.checked).toBe(true);
  });

  it("hides a whole group when all of its methods are switched off", async () => {
    fetchMock.mockResolvedValueOnce(
      settingsResponse({
        paymentBkashEnabled: false,
        paymentNagadEnabled: false,
        paymentRocketEnabled: false,
        paymentCardEnabled: false,
        paymentOnlineEnabled: false,
      }),
    );
    render(<CheckoutForm />);

    await waitFor(() => {
      expect(radio(/^bKash/)).not.toBeInTheDocument();
    });
    expect(radio(/^Rocket/)).not.toBeInTheDocument();
    expect(radio(/Debit \/ Credit Card/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Mobile Banking", { selector: "legend" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Card", { selector: "legend" }),
    ).not.toBeInTheDocument();
    expect(radio(/Cash on Delivery/)).toBeInTheDocument();
  });

  it("offers every method while settings load or the settings fetch fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    render(<CheckoutForm />);

    // The fallback is the demo-config list: everything is offered.
    expect(radio(/Cash on Delivery/)).toBeInTheDocument();
    expect(radio(/^bKash/)).toBeInTheDocument();
    expect(radio(/^Nagad/)).toBeInTheDocument();
    expect(radio(/^Rocket/)).toBeInTheDocument();
    expect(radio(/Debit \/ Credit Card/)).toBeInTheDocument();
  });
});
