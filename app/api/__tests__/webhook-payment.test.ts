/**
 * @vitest-environment node
 */
import { POST } from "@/app/api/webhooks/payment/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { markMock } = vi.hoisted(() => ({
  markMock: vi.fn(),
}));

/**
 * The webhook route only uses markOrderPaymentStatus from the orders
 * module — mock that wrapper (not the network) and keep the real
 * reference pattern so a bad reference still fails the route schema.
 */
vi.mock("@/lib/supabase/orders", () => ({
  ORDER_REFERENCE_PATTERN: /^RB-2026-\d{6}$/,
  markOrderPaymentStatus: markMock,
}));

const SECRET = "test-webhook-secret";
const REFERENCE = "RB-2026-123456";

function sign(rawBody: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(rawBody).digest("hex")}`;
}

function postWebhook(input: {
  body: string;
  signature?: string | null;
}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.signature !== null && input.signature !== undefined) {
    headers["x-webhook-signature"] = input.signature;
  }
  return POST(
    new Request("http://localhost/api/webhooks/payment", {
      method: "POST",
      headers,
      body: input.body,
    }),
  );
}

function postSigned(payload: unknown): Promise<Response> {
  const rawBody = JSON.stringify(payload);
  return postWebhook({ body: rawBody, signature: sign(rawBody) });
}

describe("POST /api/webhooks/payment (S-3, T-32)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markMock.mockReset();
    __resetRateLimits();
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
  });

  it("rejects an unsigned request with 401 and changes no state", async () => {
    const response = await postWebhook({
      body: JSON.stringify({ reference: REFERENCE, status: "paid" }),
      signature: null,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Invalid signature.",
    });
    expect(markMock).not.toHaveBeenCalled();
  });

  it("rejects a request with a wrong signature with 401 and changes no state", async () => {
    const rawBody = JSON.stringify({ reference: REFERENCE, status: "paid" });
    const response = await postWebhook({
      body: rawBody,
      signature: `sha256=${"0".repeat(64)}`,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Invalid signature.",
    });
    expect(markMock).not.toHaveBeenCalled();
  });

  it("rejects every request with 401 when no secret is set (demo-safe mode)", async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    try {
      const response = await postSigned({
        reference: REFERENCE,
        status: "paid",
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        ok: false,
        error: "Invalid signature.",
      });
      expect(markMock).not.toHaveBeenCalled();
    } finally {
      process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
    }
  });

  it("returns 404 for a valid signature with an unknown reference", async () => {
    markMock.mockResolvedValue({ ok: false, error: "not_found" });

    const response = await postSigned({
      reference: REFERENCE,
      status: "paid",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Order not found.",
    });
    expect(markMock).toHaveBeenCalledWith(REFERENCE, "paid");
  });

  it("returns 200 and marks the order paid for a valid signed request", async () => {
    markMock.mockResolvedValue({ ok: true });

    const response = await postSigned({
      reference: REFERENCE,
      status: "paid",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(markMock).toHaveBeenCalledTimes(1);
    expect(markMock).toHaveBeenCalledWith(REFERENCE, "paid");
  });

  it("returns 200 and marks the order failed for a valid signed failure", async () => {
    markMock.mockResolvedValue({ ok: true });

    const response = await postSigned({
      reference: REFERENCE,
      status: "failed",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(markMock).toHaveBeenCalledWith(REFERENCE, "failed");
  });

  it("returns 400 for a signed payload with a bad reference and calls nothing", async () => {
    const response = await postSigned({
      reference: "RB-2026-123",
      status: "paid",
    });

    expect(response.status).toBe(400);
    expect(markMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a signed payload with a bad status and calls nothing", async () => {
    const response = await postSigned({
      reference: REFERENCE,
      status: "refunded",
    });

    expect(response.status).toBe(400);
    expect(markMock).not.toHaveBeenCalled();
  });

  it("returns 400 for signed invalid JSON and calls nothing", async () => {
    const rawBody = "{not json";
    const response = await postWebhook({
      body: rawBody,
      signature: sign(rawBody),
    });

    expect(response.status).toBe(400);
    expect(markMock).not.toHaveBeenCalled();
  });

  it("maps invalid_status to 400", async () => {
    markMock.mockResolvedValue({ ok: false, error: "invalid_status" });

    const response = await postSigned({
      reference: REFERENCE,
      status: "paid",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Invalid payment status.",
    });
  });

  it("maps invalid_transition to 409 (e.g. a COD order can never be re-marked)", async () => {
    markMock.mockResolvedValue({ ok: false, error: "invalid_transition" });

    const response = await postSigned({
      reference: REFERENCE,
      status: "paid",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Payment status cannot be changed.",
    });
  });

  it("rate limits the webhook after 20 attempts in a minute (429 + Retry-After)", async () => {
    markMock.mockResolvedValue({ ok: true });
    const payload = { reference: REFERENCE, status: "paid" };

    for (let i = 0; i < 20; i++) {
      const response = await postSigned(payload);
      expect(response.status).toBe(200);
    }

    const limited = await postSigned(payload);
    expect(limited.status).toBe(429);
    const retryAfter = limited.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
    // The 21st attempt never reached the wrapper.
    expect(markMock).toHaveBeenCalledTimes(20);
  });
});
