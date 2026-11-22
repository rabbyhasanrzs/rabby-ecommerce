/**
 * @vitest-environment node
 */
import { POST as bagValidatePOST } from "@/app/api/bag/validate/route";
import { POST as checkoutPOST } from "@/app/api/checkout/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, validateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  validateMock: vi.fn(),
}));

/**
 * Checkout / bag-validate routes only use the orders-module wrappers
 * — mock those (not the network). The rate limiter itself is real:
 * these tests prove the S-6 budgets (checkout 10 / 10 minutes,
 * bag-validate 30 / minute) actually bite at the route level.
 */
vi.mock("@/lib/supabase/orders", () => ({
  ORDER_REFERENCE_PATTERN: /^RB-2026-\d{6}$/,
  createGuestOrder: createMock,
  validateBagItems: validateMock,
  GuestOrderError: class GuestOrderError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
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

const BAG_BODY = {
  items: [{ slug: "sample-round-a", variantColour: null, quantity: 1 }],
};

function postCheckout(ip?: string): Promise<Response> {
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
      body: JSON.stringify(CHECKOUT_BODY),
    }),
  );
}

function postBagValidate(ip?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ip) {
    headers["x-forwarded-for"] = ip;
  }
  return bagValidatePOST(
    new Request("http://localhost/api/bag/validate", {
      method: "POST",
      headers,
      body: JSON.stringify(BAG_BODY),
    }),
  );
}

describe("checkout + bag-validate rate limiting (S-6, T-61, S6-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
    createMock.mockResolvedValue({
      reference: "RB-2026-123456",
      totalBdt: 1083,
    });
    validateMock.mockResolvedValue({ items: BAG_BODY.items, issues: [] });
  });

  it("allows 10 checkouts then returns 429 with Retry-After", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await postCheckout(IP);
      expect(response.status).toBe(200);
    }
    expect(createMock).toHaveBeenCalledTimes(10);

    const limited = await postCheckout(IP);
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
    // The 11th attempt never reached the order function.
    expect(createMock).toHaveBeenCalledTimes(10);
  });

  it("malformed checkout bodies do not consume budget", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await checkoutPOST(
        new Request("http://localhost/api/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": IP,
          },
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
    }
    // A valid body still works — the invalid ones never counted.
    const response = await postCheckout(IP);
    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("gives a different IP a fresh checkout budget", async () => {
    for (let i = 0; i < 10; i++) {
      await postCheckout(IP);
    }
    expect(createMock).toHaveBeenCalledTimes(10);

    const response = await postCheckout("198.51.100.42");
    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(11);
  });

  it("allows 30 bag validations then returns 429 with Retry-After", async () => {
    for (let i = 0; i < 30; i++) {
      const response = await postBagValidate(IP);
      expect(response.status).toBe(200);
    }
    expect(validateMock).toHaveBeenCalledTimes(30);

    const limited = await postBagValidate(IP);
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
    expect(validateMock).toHaveBeenCalledTimes(30);
  });
});
