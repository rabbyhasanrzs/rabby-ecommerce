/**
 * @vitest-environment node
 */
import { POST as checkoutPOST } from "@/app/api/checkout/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, sendEmailMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

/**
 * The checkout route only uses the orders-module wrappers and the
 * email module — mock those (not the network). The rate limiter is
 * real, so each test posts from a fresh IP.
 */
vi.mock("@/lib/supabase/orders", () => ({
  ORDER_REFERENCE_PATTERN: /^RB-2026-\d{6}$/,
  createGuestOrder: createMock,
  GuestOrderError: class GuestOrderError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  SupabaseNotConfiguredError: class SupabaseNotConfiguredError extends Error {},
}));

vi.mock("@/lib/order-email", () => ({
  sendOrderConfirmationEmail: sendEmailMock,
}));

const CHECKOUT_BODY = {
  customer: {
    name: "Rabby Hasan",
    phone: "01712345678",
    email: "rabby@example.com",
    address: "House 12, Road 5, Dhanmondi, Dhaka",
    zone: "inside",
    paymentMethod: "cod",
  },
  items: [{ slug: "sample-round-a", variantColour: null, quantity: 1 }],
};

let ipCounter = 0;

function postCheckout(): Promise<Response> {
  ipCounter += 1;
  return checkoutPOST(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `203.0.113.${ipCounter}`,
      },
      body: JSON.stringify(CHECKOUT_BODY),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  createMock.mockResolvedValue({
    reference: "RB-2026-123456",
    totalBdt: 1583,
  });
  sendEmailMock.mockResolvedValue({ status: "sent" });
});

describe("POST /api/checkout — order confirmation email", () => {
  it("sends the confirmation email after the order is created", async () => {
    const response = await postCheckout();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      ok: true,
      reference: "RB-2026-123456",
      totalBdt: 1583,
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith({
      reference: "RB-2026-123456",
      phone: "01712345678",
      customerEmail: "rabby@example.com",
    });
  });

  it("still returns a successful order when the email send rejects", async () => {
    sendEmailMock.mockRejectedValue(new Error("Gmail unavailable"));
    const response = await postCheckout();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      ok: true,
      reference: "RB-2026-123456",
      totalBdt: 1583,
    });
  });

  it("still returns a successful order when the email send throws synchronously", async () => {
    sendEmailMock.mockImplementation(() => {
      throw new Error("Email module crashed");
    });
    const response = await postCheckout();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      ok: true,
      reference: "RB-2026-123456",
      totalBdt: 1583,
    });
  });
});
