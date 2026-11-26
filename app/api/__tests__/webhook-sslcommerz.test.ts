/**
 * @vitest-environment node
 */
import { POST } from "@/app/api/webhooks/sslcommerz/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getGatewayOrderMock,
  recordGatewayPaymentMock,
  markMock,
  sendConfirmationMock,
  sendFailedMock,
} = vi.hoisted(() => ({
  getGatewayOrderMock: vi.fn(),
  recordGatewayPaymentMock: vi.fn(),
  markMock: vi.fn(),
  sendConfirmationMock: vi.fn(),
  sendFailedMock: vi.fn(),
}));

/**
 * The IPN route settles through the real lib/sslcommerz-settle
 * (validation is the only proof) — mock the database wrappers, the
 * email senders, and the gateway HTTP calls (fetch), not the settle
 * logic itself. A forged or amount-tampered IPN must change nothing.
 */
vi.mock("@/lib/supabase/orders", () => ({
  ORDER_REFERENCE_PATTERN: /^RB-2026-\d{6}$/,
  getGatewayOrder: getGatewayOrderMock,
  recordGatewayPayment: recordGatewayPaymentMock,
  markOrderPaymentStatus: markMock,
}));

vi.mock("@/lib/order-email", () => ({
  sendOrderConfirmationEmail: sendConfirmationMock,
  sendPaymentFailedEmail: sendFailedMock,
}));

const fetchMock = vi.fn();

const SECRET = "test-webhook-secret";
const REFERENCE = "RB-2026-123456";
const TOTAL_BDT = 1583;

const PENDING_ORDER = {
  totalBdt: TOTAL_BDT,
  paymentStatus: "pending",
  paymentMethod: "online",
  customerPhone: "01712345678",
  customerEmail: "rabby@example.com",
};

const VALIDATION_OK = {
  status: "VALID",
  tran_id: REFERENCE,
  val_id: "261126123456AbCdEf",
  amount: "1583.00",
  store_amount: "1543.42",
  currency: "BDT",
  bank_tran_id: "261126123456",
  card_brand: "VISA",
  card_type: "VISA",
  risk_level: "0",
};

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function postIpn(fields: Record<string, string>): Promise<Response> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return POST(
    new Request("http://localhost/api/webhooks/sslcommerz", {
      method: "POST",
      body: form,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  __resetRateLimits();
  vi.unstubAllEnvs();
  process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
  vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
  vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "test-password");
  vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
  getGatewayOrderMock.mockResolvedValue(PENDING_ORDER);
  recordGatewayPaymentMock.mockResolvedValue({ ok: true });
  markMock.mockResolvedValue({ ok: true });
  sendConfirmationMock.mockResolvedValue({ status: "sent" });
  sendFailedMock.mockResolvedValue({ status: "sent" });
  // The Validation API answers VALID by default; the Query API
  // answers FAILED by default (the failed-IPN tests override it).
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("validationserverAPI.php")) {
      return jsonResponse(VALIDATION_OK);
    }
    if (url.includes("merchantTransIDvalidationAPI.php")) {
      return jsonResponse({ ...VALIDATION_OK, status: "FAILED" });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/sslcommerz (S-7 IPN)", () => {
  it("marks a validated payment paid and sends the confirmation email once", async () => {
    const response = await postIpn({
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
      amount: "1583.00",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(recordGatewayPaymentMock).toHaveBeenCalledWith(
      REFERENCE,
      {
        valId: "261126123456AbCdEf",
        bankTranId: "261126123456",
        cardBrand: "VISA",
        storeAmountBdt: 1543,
        riskLevel: 0,
      },
      SECRET,
    );
    expect(markMock).toHaveBeenCalledWith(REFERENCE, "paid", SECRET);
    expect(sendConfirmationMock).toHaveBeenCalledTimes(1);
    expect(sendConfirmationMock).toHaveBeenCalledWith({
      reference: REFERENCE,
      phone: "01712345678",
      customerEmail: "rabby@example.com",
    });
    expect(sendFailedMock).not.toHaveBeenCalled();
  });

  it("a replayed IPN changes nothing: the already-paid order is never re-validated or re-emailed", async () => {
    getGatewayOrderMock.mockResolvedValue({
      ...PENDING_ORDER,
      paymentStatus: "paid",
    });

    const response = await postIpn({
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordGatewayPaymentMock).not.toHaveBeenCalled();
    expect(markMock).not.toHaveBeenCalled();
    expect(sendConfirmationMock).not.toHaveBeenCalled();
  });

  it("a forged IPN (INVALID_TRANSACTION) changes nothing", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("validationserverAPI.php")) {
        return jsonResponse({
          status: "INVALID_TRANSACTION",
          tran_id: REFERENCE,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const response = await postIpn({
      tran_id: REFERENCE,
      val_id: "forged-val-id",
      status: "VALID",
    });

    expect(response.status).toBe(200);
    expect(recordGatewayPaymentMock).not.toHaveBeenCalled();
    expect(markMock).not.toHaveBeenCalled();
    expect(sendConfirmationMock).not.toHaveBeenCalled();
  });

  it("an amount-tampered IPN changes nothing", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("validationserverAPI.php")) {
        return jsonResponse({ ...VALIDATION_OK, amount: "1.00" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const response = await postIpn({
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(200);
    expect(markMock).not.toHaveBeenCalled();
    expect(sendConfirmationMock).not.toHaveBeenCalled();
  });

  it("a FAILED IPN confirmed by the Query API marks the order failed and sends the failed email", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("validationserverAPI.php")) {
        return jsonResponse({
          status: "FAILED",
          tran_id: REFERENCE,
          val_id: "261126123456AbCdEf",
        });
      }
      if (url.includes("merchantTransIDvalidationAPI.php")) {
        return jsonResponse({ ...VALIDATION_OK, status: "FAILED" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const response = await postIpn({
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "FAILED",
    });

    expect(response.status).toBe(200);
    expect(markMock).toHaveBeenCalledWith(REFERENCE, "failed", SECRET);
    expect(sendFailedMock).toHaveBeenCalledTimes(1);
    expect(sendFailedMock).toHaveBeenCalledWith({ reference: REFERENCE });
    expect(sendConfirmationMock).not.toHaveBeenCalled();
  });

  it("a FAILED IPN the query cannot confirm (EXPIRED) leaves the order pending", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("validationserverAPI.php")) {
        return jsonResponse({
          status: "FAILED",
          tran_id: REFERENCE,
          val_id: "261126123456AbCdEf",
        });
      }
      if (url.includes("merchantTransIDvalidationAPI.php")) {
        return jsonResponse({ ...VALIDATION_OK, status: "EXPIRED" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const response = await postIpn({
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "FAILED",
    });

    expect(response.status).toBe(200);
    expect(markMock).not.toHaveBeenCalled();
    expect(sendFailedMock).not.toHaveBeenCalled();
  });

  it("an IPN for an unknown order returns 200 and changes nothing", async () => {
    getGatewayOrderMock.mockResolvedValue(null);

    const response = await postIpn({
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(markMock).not.toHaveBeenCalled();
  });

  it("an IPN for a non-online order changes nothing", async () => {
    getGatewayOrderMock.mockResolvedValue({
      ...PENDING_ORDER,
      paymentMethod: "cod",
    });

    const response = await postIpn({
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(markMock).not.toHaveBeenCalled();
  });

  it("returns 200 without verifying anything when the webhook secret is not set", async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;

    const response = await postIpn({
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(200);
    expect(getGatewayOrderMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing tran_id and calls nothing", async () => {
    const response = await postIpn({ val_id: "261126123456AbCdEf" });

    expect(response.status).toBe(400);
    expect(getGatewayOrderMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed reference and calls nothing", async () => {
    const response = await postIpn({
      tran_id: "RB-2026-123",
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(400);
    expect(getGatewayOrderMock).not.toHaveBeenCalled();
  });

  it("rate limits the IPN after 20 attempts in a minute (429 + Retry-After)", async () => {
    for (let i = 0; i < 20; i++) {
      const response = await postIpn({
        tran_id: REFERENCE,
        val_id: "261126123456AbCdEf",
        status: "VALID",
      });
      expect(response.status).toBe(200);
    }

    const limited = await postIpn({
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).not.toBeNull();
    expect(await limited.json()).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
  });
});
