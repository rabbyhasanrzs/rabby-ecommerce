/**
 * @vitest-environment node
 */
import { POST as validatePOST } from "@/app/api/coupons/validate/route";
import { POST as checkoutPOST } from "@/app/api/checkout/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, validateMock, GuestOrderErrorMock, CouponInvalidErrorMock } =
  vi.hoisted(() => ({
    createMock: vi.fn(),
    validateMock: vi.fn(),
    GuestOrderErrorMock: class GuestOrderError extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    },
    CouponInvalidErrorMock: class CouponInvalidError extends Error {
      constructor() {
        super("This coupon code isn't valid. Check the code and try again.");
      }
    },
  }));

/**
 * Coupon routes only use the orders-module wrappers — mock those
 * (not the network). getSiteSettings() is real: with no env vars it
 * returns the DEMO CONFIG defaults (tax 5%, Inside ৳60 / Outside
 * ৳120), which is exactly the fallback the route uses.
 */
vi.mock("@/lib/supabase/orders", () => ({
  ORDER_REFERENCE_PATTERN: /^RB-2026-\d{6}$/,
  createGuestOrder: createMock,
  validateDiscountCode: validateMock,
  GuestOrderError: GuestOrderErrorMock,
  CouponInvalidError: CouponInvalidErrorMock,
  SupabaseNotConfiguredError: class SupabaseNotConfiguredError extends Error {},
}));

const IP = "203.0.113.7";

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

function postValidate(
  body: unknown,
  ip?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ip) {
    headers["x-forwarded-for"] = ip;
  }
  return validatePOST(
    new Request("http://localhost/api/coupons/validate", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function postCheckout(body: unknown, ip?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ip) {
    headers["x-forwarded-for"] = ip;
  }
  return checkoutPOST(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  validateMock.mockResolvedValue({ percentOff: 10 });
  createMock.mockResolvedValue({
    reference: "RB-2026-123456",
    totalBdt: 1005,
  });
});

// ---------------------------------------------------------------------------
// POST /api/coupons/validate
// ---------------------------------------------------------------------------

describe("POST /api/coupons/validate", () => {
  it("returns percent + discounted totals for a valid code", async () => {
    const response = await postValidate(
      { code: "RE518", subtotalBdt: 1000, zone: "inside" },
      IP,
    );
    expect(response.status).toBe(200);
    // Discount 100, discounted subtotal 900, tax 5% of 900 = 45,
    // delivery 60, total 1005.
    expect(await response.json()).toEqual({
      ok: true,
      percentOff: 10,
      discountBdt: 100,
      totals: {
        subtotalBdt: 1000,
        discountBdt: 100,
        taxBdt: 45,
        deliveryFeeBdt: 60,
        totalBdt: 1005,
      },
    });
  });

  it("uses the outside delivery fee for the outside zone", async () => {
    const response = await postValidate(
      { code: "RE518", subtotalBdt: 1000, zone: "outside" },
      IP,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totals.deliveryFeeBdt).toBe(120);
    expect(body.totals.totalBdt).toBe(1065);
  });

  it("normalises a lowercase code before validating it", async () => {
    const response = await postValidate(
      { code: "re518", subtotalBdt: 1000, zone: "inside" },
      IP,
    );
    expect(response.status).toBe(200);
    expect(validateMock).toHaveBeenCalledWith("RE518");
  });

  it("returns 400 with one plain message for an unknown code", async () => {
    validateMock.mockRejectedValue(new CouponInvalidErrorMock());

    const response = await postValidate(
      { code: "NOPE123", subtotalBdt: 1000, zone: "inside" },
      IP,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "This coupon code isn't valid. Check the code and try again.",
    });
  });

  it("returns the SAME 400 message for an inactive code (no enumeration leak)", async () => {
    // DEMO10 is deactivated live — the RPC raises the same
    // 'coupon_invalid' for it as for a code that never existed.
    validateMock.mockRejectedValue(new CouponInvalidErrorMock());

    const response = await postValidate(
      { code: "DEMO10", subtotalBdt: 1000, zone: "inside" },
      IP,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "This coupon code isn't valid. Check the code and try again.",
    });
  });

  it("returns 400 for a malformed body", async () => {
    for (const body of [
      { code: "ab", subtotalBdt: 1000, zone: "inside" },
      { code: "RE518", subtotalBdt: -1, zone: "inside" },
      { code: "RE518", subtotalBdt: 1000, zone: "nowhere" },
      { subtotalBdt: 1000, zone: "inside" },
    ]) {
      const response = await postValidate(body, IP);
      expect(response.status).toBe(400);
    }
    // No malformed request reached the RPC.
    expect(validateMock).not.toHaveBeenCalled();
  });

  it("allows 10 validations then returns 429 with Retry-After", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await postValidate(
        { code: "RE518", subtotalBdt: 1000, zone: "inside" },
        IP,
      );
      expect(response.status).toBe(200);
    }
    expect(validateMock).toHaveBeenCalledTimes(10);

    const limited = await postValidate(
      { code: "RE518", subtotalBdt: 1000, zone: "inside" },
      IP,
    );
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
    // The 11th attempt never reached the RPC.
    expect(validateMock).toHaveBeenCalledTimes(10);
  });

  it("malformed bodies do not consume the rate-limit budget", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await postValidate(
        { code: "ab", subtotalBdt: 1000, zone: "inside" },
        IP,
      );
      expect(response.status).toBe(400);
    }
    const response = await postValidate(
      { code: "RE518", subtotalBdt: 1000, zone: "inside" },
      IP,
    );
    expect(response.status).toBe(200);
    expect(validateMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/checkout — coupon pass-through
// ---------------------------------------------------------------------------

describe("POST /api/checkout with a coupon", () => {
  it("passes the discount code through to createGuestOrder", async () => {
    const response = await postCheckout(
      { ...CHECKOUT_BODY, discountCode: "RE518" },
      IP,
    );
    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ discountCode: "RE518" }),
    );
    expect(await response.json()).toEqual({
      ok: true,
      reference: "RB-2026-123456",
      totalBdt: 1005,
    });
  });

  it("passes no code through when none was applied", async () => {
    const response = await postCheckout(CHECKOUT_BODY, IP);
    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ discountCode: undefined }),
    );
  });

  it("returns 400 with the coupon message when the code fails at order creation", async () => {
    createMock.mockRejectedValue(
      new GuestOrderErrorMock(
        "VALIDATION",
        "This coupon code isn't valid. Check the code and try again.",
      ),
    );

    const response = await postCheckout(
      { ...CHECKOUT_BODY, discountCode: "DEMO10" },
      IP,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "This coupon code isn't valid. Check the code and try again.",
    });
  });

  it("rejects a malformed coupon code in the checkout body", async () => {
    const response = await postCheckout(
      { ...CHECKOUT_BODY, discountCode: "ab" },
      IP,
    );
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });
});
