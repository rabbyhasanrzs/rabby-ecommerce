/**
 * @vitest-environment node
 */
import { POST as cancelPOST } from "@/app/checkout/payment/cancel/route";
import { POST as failPOST } from "@/app/checkout/payment/fail/route";
import { POST as successPOST } from "@/app/checkout/payment/success/route";
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
 * The gateway return handlers settle through the real
 * lib/sslcommerz-settle — mock the database wrappers, the email
 * senders, and the gateway HTTP calls (fetch), not the settle
 * logic. A return is never proof on its own: the success return
 * validates, the fail / cancel returns confirm through the Query
 * API. All redirects are 303, so a refresh never re-posts.
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

const PENDING_ORDER = {
  totalBdt: 1583,
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

function postReturn(
  handler: (request: Request) => Promise<Response>,
  path: string,
  fields: Record<string, string>,
): Promise<Response> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return handler(
    new Request(`http://localhost${path}`, {
      method: "POST",
      body: form,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
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

describe("POST /checkout/payment/success (S-7)", () => {
  it("validates the return and redirects to the confirmation page (no payment param)", async () => {
    const response = await postReturn(successPOST, "/checkout/payment/success", {
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost/order/confirmation?ref=RB-2026-123456",
    );
    expect(markMock).toHaveBeenCalledWith(REFERENCE, "paid", SECRET);
    expect(sendConfirmationMock).toHaveBeenCalledTimes(1);
  });

  it("redirects with payment=confirming when validation cannot prove the payment", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("validationserverAPI.php")) {
        return jsonResponse({ ...VALIDATION_OK, amount: "1.00" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const response = await postReturn(successPOST, "/checkout/payment/success", {
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost/order/confirmation?ref=RB-2026-123456&payment=confirming",
    );
    expect(markMock).not.toHaveBeenCalled();
    expect(sendConfirmationMock).not.toHaveBeenCalled();
  });

  it("redirects with payment=confirming when the return carries no val_id", async () => {
    const response = await postReturn(successPOST, "/checkout/payment/success", {
      tran_id: REFERENCE,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toContain("payment=confirming");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(markMock).not.toHaveBeenCalled();
  });

  it("redirects to the confirmation page when the IPN already settled the order", async () => {
    getGatewayOrderMock.mockResolvedValue({
      ...PENDING_ORDER,
      paymentStatus: "paid",
    });

    const response = await postReturn(successPOST, "/checkout/payment/success", {
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost/order/confirmation?ref=RB-2026-123456",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects home for an unknown order", async () => {
    getGatewayOrderMock.mockResolvedValue(null);

    const response = await postReturn(successPOST, "/checkout/payment/success", {
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "VALID",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost/");
  });

  it("redirects home for a malformed return (no tran_id)", async () => {
    const response = await postReturn(successPOST, "/checkout/payment/success", {
      val_id: "261126123456AbCdEf",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost/");
    expect(getGatewayOrderMock).not.toHaveBeenCalled();
  });
});

describe("POST /checkout/payment/fail (S-7)", () => {
  it("confirms the failure through the Query API and redirects with payment=failed", async () => {
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

    const response = await postReturn(failPOST, "/checkout/payment/fail", {
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "FAILED",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost/order/confirmation?ref=RB-2026-123456&payment=failed",
    );
    expect(markMock).toHaveBeenCalledWith(REFERENCE, "failed", SECRET);
    expect(sendFailedMock).toHaveBeenCalledTimes(1);
  });

  it("redirects with payment=failed but marks nothing when the failure cannot be confirmed", async () => {
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

    const response = await postReturn(failPOST, "/checkout/payment/fail", {
      tran_id: REFERENCE,
      val_id: "261126123456AbCdEf",
      status: "FAILED",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toContain("payment=failed");
    expect(markMock).not.toHaveBeenCalled();
    expect(sendFailedMock).not.toHaveBeenCalled();
  });
});

describe("POST /checkout/payment/cancel (S-7)", () => {
  it("confirms the cancellation through the Query API and redirects with payment=cancelled", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("merchantTransIDvalidationAPI.php")) {
        return jsonResponse({ ...VALIDATION_OK, status: "CANCELLED" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const response = await postReturn(cancelPOST, "/checkout/payment/cancel", {
      tran_id: REFERENCE,
      status: "CANCELLED",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost/order/confirmation?ref=RB-2026-123456&payment=cancelled",
    );
    expect(markMock).toHaveBeenCalledWith(REFERENCE, "failed", SECRET);
    expect(sendFailedMock).toHaveBeenCalledTimes(1);
  });

  it("redirects home for a malformed return", async () => {
    const response = await postReturn(cancelPOST, "/checkout/payment/cancel", {
      status: "CANCELLED",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost/");
    expect(getGatewayOrderMock).not.toHaveBeenCalled();
  });
});
