import CheckoutForm from "@/components/checkout-form";
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

describe("CheckoutForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    sessionStorage.clear();
  });

  it("shows the order summary with live totals", () => {
    render(<CheckoutForm />);

    expect(screen.getByText(/SAMPLE Round A/)).toBeInTheDocument();
    expect(screen.getByText(/SAMPLE Aviator A/)).toBeInTheDocument();
    // Subtotal ৳3,100 + tax 5% (৳155) + delivery ৳60 = ৳3,315.
    expect(screen.getByText("৳3,100")).toBeInTheDocument();
    expect(screen.getByText("৳155")).toBeInTheDocument();
    expect(screen.getByText("৳3,315")).toBeInTheDocument();
  });

  it("updates the delivery fee when the zone changes", () => {
    render(<CheckoutForm />);

    fireEvent.click(screen.getByLabelText(/Outside Dhaka/));
    // ৳3,100 + ৳155 + ৳120 = ৳3,375.
    expect(screen.getByText("৳3,375")).toBeInTheDocument();
  });

  it("submitting empty shows inline errors and focuses the first error", async () => {
    render(<CheckoutForm />);

    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    expect(
      await screen.findByText("Enter your full name."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter a valid Bangladeshi mobile number (01XXXXXXXXX).",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(
      screen.getByText("Enter your full delivery address."),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Full name"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submitting valid data validates the bag, places the order and navigates", async () => {
    fetchMock
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
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/order/confirmation?ref=RB-2026-123456",
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/bag/validate");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        items: [
          { slug: "sample-round-a", quantity: 2, priceBdt: 950 },
          { slug: "sample-aviator-a", quantity: 1, priceBdt: 1200 },
        ],
      }),
    );
    const checkoutBody = JSON.parse(
      fetchMock.mock.calls[1]?.[1]?.body as string,
    );
    expect(checkoutBody.customer.phone).toBe("01712345678");
    expect(checkoutBody.customer.zone).toBe("inside");
    expect(checkoutBody.paymentMethod).toBe("cod");
    expect(checkoutBody.items).toEqual([
      { slug: "sample-round-a", variantColour: "Black", quantity: 2 },
      { slug: "sample-aviator-a", variantColour: null, quantity: 1 },
    ]);
    expect(clearBagMock).toHaveBeenCalled();
    expect(sessionStorage.getItem("rabby-order-phone")).toBe("01712345678");
  });

  it("a validate issue blocks checkout and shows the banner", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        items: [],
        issues: [
          {
            slug: "sample-round-a",
            type: "out_of_stock",
            message: "SAMPLE Round A is out of stock.",
          },
        ],
      }),
    });
    render(<CheckoutForm />);
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    expect(
      await screen.findByText("SAMPLE Round A is out of stock."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("a failed checkout shows an error and keeps the entered values", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, items: [], issues: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          error: "Something went wrong. Please try again.",
        }),
      });
    render(<CheckoutForm />);
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Rabby Hasan");
    expect(screen.getByLabelText("Phone number")).toHaveValue(
      "+8801712345678",
    );
    expect(screen.getByLabelText("Email")).toHaveValue("rabby@example.com");
    expect(screen.getByLabelText("Delivery address")).toHaveValue(
      "House 12, Road 5, Dhanmondi, Dhaka",
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(clearBagMock).not.toHaveBeenCalled();
  });
});
