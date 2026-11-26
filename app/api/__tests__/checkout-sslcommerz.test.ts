/**
 * @vitest-environment node
 */
import { POST as checkoutPOST } from "@/app/api/checkout/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, recordMock, sendEmailMock, GuestOrderError } =
  vi.hoisted(() => ({
    createMock: vi.fn(),
    recordMock: vi.fn(),
    sendEmailMock: vi.fn(),
    GuestOrderError: class GuestOrderError extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    },
  }));

/**
 * The checkout route's online branch runs the real
 * lib/sslcommerz initiate (fetch is mocked) — only the order
 * creation, the gateway-record write and the email sender are
 * mocked. The rate limiter is real, so each test posts from a
 * fresh IP.
 */
vi.mock("@/lib/supabase/orders", () => ({
  ORDER_REFERENCE_PATTERN: /^RB-2026-\d{6}$/,
  createGuestOrder: createMock,
  recordGatewayPayment: recordMock,
  GuestOrderError,
  SupabaseNotConfiguredError: class SupabaseNotConfiguredError extends Error {},
}));

vi.mock("@/lib/order-email", () => ({
  sendOrderConfirmationEmail: sendEmailMock,
}));

const fetchMock = vi.fn();

const REFERENCE = "RB-2026-123456";
const TOTAL_BDT = 1583;

function onlineBody() {
  return {
    customer: {
      name: "Rabby Hasan",
      phone: "01712345678",
      email: "rabby@example.com",
      address: "House 12, Road 5, Dhanmondi, Dhaka",
      zone: "inside",
      paymentMethod: "online",
    },
    items: [
      { slug: "sample-round-a", variantColour: "Black", quantity: 2 },
      { slug: "sample-aviator-a", variantColour: null, quantity: 1 },
    ],
  };
}

let ipCounter = 0;

function postCheckout(body: unknown): Promise<Response> {
  ipCounter += 1;
  return checkoutPOST(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `203.0.113.${ipCounter}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  __resetRateLimits();
  vi.unstubAllEnvs();
  createMock.mockResolvedValue({
    reference: REFERENCE,
    totalBdt: TOTAL_BDT,
  });
  recordMock.mockResolvedValue({ ok: true });
  sendEmailMock.mockResolvedValue({ status: "sent" });
  process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/checkout — Pay Online (S-7)", () => {
  it("returns 503 and creates NO order when the gateway is not configured", async () => {
    const response = await postCheckout(onlineBody());

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/not available right now/i);
    expect(createMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates the order, starts the gateway session, returns the gateway URL, and sends NO confirmation email yet", async () => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "test-password");
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "SUCCESS",
        sessionkey: "test-session-key",
        GatewayPageURL:
          "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=TEST",
      }),
    );

    const response = await postCheckout(onlineBody());

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      ok: true,
      reference: REFERENCE,
      totalBdt: TOTAL_BDT,
      gatewayUrl:
        "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=TEST",
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    // The session key is stored now; the email waits until the
    // payment validates (the IPN / return settle sends it).
    expect(recordMock).toHaveBeenCalledWith(
      REFERENCE,
      { sessionKey: "test-session-key" },
      "test-webhook-secret",
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
    // The initiate carried the order total and the item count.
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(options.body as string);
    expect(body.get("total_amount")).toBe("1583.00");
    expect(body.get("tran_id")).toBe(REFERENCE);
    expect(body.get("num_of_item")).toBe("3");
  });

  it("returns 503 with the reference when the gateway cannot start a session — the order stays pending", async () => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "test-password");
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "FAILED", failedreason: "Invalid store id" }),
    );

    const response = await postCheckout(onlineBody());

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.reference).toBe(REFERENCE);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(recordMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns 503 with the reference when the gateway cannot be reached", async () => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "test-password");
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
    fetchMock.mockRejectedValue(new Error("network down"));

    const response = await postCheckout(onlineBody());

    expect(response.status).toBe(503);
    expect((await response.json()).reference).toBe(REFERENCE);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("still redirects when the session key cannot be stored (missing webhook secret) — the IPN will fail closed", async () => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "test-password");
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    recordMock.mockResolvedValue({ ok: false, error: "unauthorized" });
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "SUCCESS",
        sessionkey: "test-session-key",
        GatewayPageURL:
          "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=TEST",
      }),
    );

    const response = await postCheckout(onlineBody());

    expect(response.status).toBe(200);
    expect((await response.json()).gatewayUrl).toContain(
      "sandbox.sslcommerz.com",
    );
  });

  it("blocks an online order when the owner switched the method off (400, toggle enforced by the order function)", async () => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "test-password");
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
    createMock.mockRejectedValue(
      new GuestOrderError(
        "VALIDATION",
        "This payment method is currently unavailable. Please choose another.",
      ),
    );

    const response = await postCheckout(onlineBody());

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(
      /payment method is currently unavailable/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("a COD order is unchanged: confirmation email sent, no gateway URL", async () => {
    const response = await postCheckout({
      ...onlineBody(),
      customer: { ...onlineBody().customer, paymentMethod: "cod" },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      ok: true,
      reference: REFERENCE,
      totalBdt: TOTAL_BDT,
    });
    expect(data.gatewayUrl).toBeUndefined();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
