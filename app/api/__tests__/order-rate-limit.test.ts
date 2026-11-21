/**
 * @vitest-environment node
 */
import { POST as cancelPOST } from "@/app/api/orders/cancel/route";
import { POST as lookupPOST } from "@/app/api/orders/lookup/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock, cancelMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  cancelMock: vi.fn(),
}));

/**
 * Lookup / cancel routes only use the orders-module wrappers — mock
 * those (not the network). The rate limiter itself is real: these
 * tests prove the G-C4 budgets (10 attempts / 10 minutes) actually
 * bite at the route level.
 */
vi.mock("@/lib/supabase/orders", () => ({
  ORDER_REFERENCE_PATTERN: /^RB-2026-\d{6}$/,
  lookupOrder: lookupMock,
  cancelOrder: cancelMock,
  SupabaseNotConfiguredError: class SupabaseNotConfiguredError extends Error {},
}));

const REFERENCE = "RB-2026-123456";
const PHONE = "01712345678";
const OTHER_PHONE = "01812345678";

const FOUND_ORDER = {
  reference: REFERENCE,
  status: "placed",
  customerName: "Rabby Hasan",
  customerPhone: PHONE,
  customerEmail: "rabby@example.com",
  deliveryAddress: "House 12, Road 5, Dhanmondi, Dhaka",
  deliveryZone: "inside",
  paymentMethod: "cod",
  subtotalBdt: 3100,
  taxBdt: 155,
  deliveryFeeBdt: 60,
  totalBdt: 3315,
  createdAt: "2026-11-22T10:00:00Z",
  items: [],
  events: [],
};

function postLookup(input: {
  reference?: string;
  phone?: string;
  ip?: string;
}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.ip) {
    headers["x-forwarded-for"] = input.ip;
  }
  return lookupPOST(
    new Request("http://localhost/api/orders/lookup", {
      method: "POST",
      headers,
      body: JSON.stringify({
        reference: input.reference ?? REFERENCE,
        phone: input.phone ?? PHONE,
      }),
    }),
  );
}

function postCancel(input: {
  reference?: string;
  phone?: string;
  ip?: string;
}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.ip) {
    headers["x-forwarded-for"] = input.ip;
  }
  return cancelPOST(
    new Request("http://localhost/api/orders/cancel", {
      method: "POST",
      headers,
      body: JSON.stringify({
        reference: input.reference ?? REFERENCE,
        phone: input.phone ?? PHONE,
      }),
    }),
  );
}

describe("order lookup / cancel rate limiting (S-3, G-C4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupMock.mockReset();
    cancelMock.mockReset();
    __resetRateLimits();
    lookupMock.mockResolvedValue(FOUND_ORDER);
    cancelMock.mockResolvedValue({ ok: true });
  });

  it("lookup returns 429 with Retry-After after 10 attempts in-window", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await postLookup({});
      expect(response.status).toBe(200);
    }
    expect(lookupMock).toHaveBeenCalledTimes(10);

    const limited = await postLookup({});
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
    // The 11th attempt never reached the wrapper.
    expect(lookupMock).toHaveBeenCalledTimes(10);
  });

  it("cancel returns 429 with Retry-After after 10 attempts in-window", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await postCancel({});
      expect(response.status).toBe(200);
    }
    expect(cancelMock).toHaveBeenCalledTimes(10);

    const limited = await postCancel({});
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(cancelMock).toHaveBeenCalledTimes(10);
  });

  it("a successful lookup works again after the limits are reset", async () => {
    for (let i = 0; i < 10; i++) {
      await postLookup({});
    }
    expect((await postLookup({})).status).toBe(429);

    __resetRateLimits();

    const response = await postLookup({});
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok?: boolean; order?: unknown };
    expect(body.ok).toBe(true);
    expect(body.order).toEqual(FOUND_ORDER);
  });

  it("the per-reference budget bites even from a fresh IP (10 attempts, same reference + phone)", async () => {
    // 10 attempts from 10 different IPs: each IP budget is fresh, but
    // the shared reference + phone budget accumulates to 10.
    for (let i = 0; i < 10; i++) {
      const response = await postLookup({ ip: `203.0.113.${i + 1}` });
      expect(response.status).toBe(200);
    }

    const limited = await postLookup({ ip: "198.51.100.99" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).not.toBeNull();
  });

  it("a different reference + phone pair still has its own budget", async () => {
    for (let i = 0; i < 10; i++) {
      await postLookup({});
    }
    expect((await postLookup({})).status).toBe(429);

    // Same IP, different order: the per-reference budget is fresh, but
    // the per-IP budget is exhausted — so this is still limited.
    // A different IP + different reference is fully fresh instead.
    const fresh = await postLookup({
      reference: "RB-2026-654321",
      phone: OTHER_PHONE,
      ip: "198.51.100.99",
    });
    expect(fresh.status).toBe(200);
  });
});
