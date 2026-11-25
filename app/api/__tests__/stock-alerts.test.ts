/**
 * @vitest-environment node
 */
import { POST } from "@/app/api/stock-alerts/route";
import {
  STOCK_ALERT_RATE_LIMIT,
  __resetRateLimits,
} from "@/lib/rate-limit";
import { SupabaseNotConfiguredError } from "@/lib/supabase/orders";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeMock, StockAlertErrorMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  StockAlertErrorMock: class StockAlertError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
}));

/** The route only uses the stock-alerts subscribe wrapper — mock that (not the network). */
vi.mock("@/lib/stock-alerts", () => ({
  subscribeStockAlert: subscribeMock,
  StockAlertError: StockAlertErrorMock,
}));

const IP = "203.0.113.7";

const VALID_BODY = {
  productSlug: "sample-futuristic",
  email: "customer@example.com",
};

function postSubscribe(body: unknown, ip?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ip) {
    headers["x-forwarded-for"] = ip;
  }
  return POST(
    new Request("http://localhost/api/stock-alerts", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  subscribeMock.mockResolvedValue({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/stock-alerts
// ---------------------------------------------------------------------------

describe("POST /api/stock-alerts", () => {
  it("returns 200 with the shared message on a valid subscription", async () => {
    const response = await postSubscribe(VALID_BODY, IP);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: "We'll email you when this is back in stock.",
    });
    expect(subscribeMock).toHaveBeenCalledWith({
      productSlug: "sample-futuristic",
      email: "customer@example.com",
    });
  });

  it("returns 400 with the checkout message for an invalid email", async () => {
    const response = await postSubscribe(
      { productSlug: "sample-futuristic", email: "not-an-email" },
      IP,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Enter a valid email address.");
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("returns 400 with the plain-words message for an in-stock product", async () => {
    subscribeMock.mockRejectedValue(
      new StockAlertErrorMock(
        "This product is in stock now — you can order it.",
      ),
    );
    const response = await postSubscribe(
      { productSlug: "sample-round-a", email: "customer@example.com" },
      IP,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("This product is in stock now — you can order it.");
  });

  it("returns 400 with the plain-words message for a missing product", async () => {
    subscribeMock.mockRejectedValue(
      new StockAlertErrorMock("That product couldn't be found."),
    );
    const response = await postSubscribe(
      { productSlug: "no-such-product", email: "customer@example.com" },
      IP,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("That product couldn't be found.");
  });

  it("returns 429 after the rate limit, with a Retry-After header", async () => {
    for (let i = 0; i < STOCK_ALERT_RATE_LIMIT; i++) {
      const response = await postSubscribe(VALID_BODY, IP);
      expect(response.status).toBe(200);
    }
    const limited = await postSubscribe(VALID_BODY, IP);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).not.toBeNull();
    const body = await limited.json();
    expect(body.error).toContain("Too many attempts");
  });

  it("does not consume budget on malformed requests (checked after parse)", async () => {
    for (let i = 0; i < STOCK_ALERT_RATE_LIMIT + 1; i++) {
      const response = await postSubscribe(
        { productSlug: "sample-futuristic", email: "not-an-email" },
        IP,
      );
      expect(response.status).toBe(400);
    }
    // The next valid request is still allowed — the malformed ones
    // never counted.
    const response = await postSubscribe(VALID_BODY, IP);
    expect(response.status).toBe(200);
  });

  it("returns 503 when Supabase is not configured", async () => {
    subscribeMock.mockRejectedValue(new SupabaseNotConfiguredError());
    const response = await postSubscribe(VALID_BODY, IP);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("temporarily unavailable");
  });

  it("returns 500 generic on an unexpected failure", async () => {
    subscribeMock.mockRejectedValue(new Error("boom"));
    const response = await postSubscribe(VALID_BODY, IP);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Something went wrong. Please try again.");
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/stock-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid request.");
  });
});
