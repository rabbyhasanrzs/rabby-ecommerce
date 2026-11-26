/**
 * @vitest-environment node
 */
import {
  checkSslcommerzValidation,
  formatSslcommerzAmount,
  getSslcommerzConfig,
  initiateSslcommerzPayment,
  isSslcommerzConfigured,
  parseSslcommerzAmount,
  querySslcommerzTransaction,
  sslcommerzStatusOutcome,
  validateSslcommerzTransaction,
} from "@/lib/sslcommerz";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SSLCommerz gateway client tests (S-7) — no network, fetch is
 * mocked. The published sandbox test cards are used only as
 * documentation here; no real card is ever sent anywhere.
 *
 * Covers: config gating (missing credentials = off), amount
 * formatting, the initiate call (URLs + customer fields), the
 * validation verdict rule (VALID/VALIDATED + tran_id + amount +
 * BDT, all three — a forged or amount-tampered response is never
 * paid), and the status map (EXPIRED / UNATTEMPTED never fail an
 * order on their own).
 */

const fetchMock = vi.fn();

const VALIDATION_OK = {
  status: "VALID",
  tran_id: "RB-2026-123456",
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
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSslcommerzConfig / isSslcommerzConfigured", () => {
  it("is not configured when the store credentials are missing", () => {
    expect(getSslcommerzConfig()).toBeNull();
    expect(isSslcommerzConfigured()).toBe(false);
  });

  it("is not configured when only the store id is set", () => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
    expect(getSslcommerzConfig()).toBeNull();
  });

  it("uses the sandbox endpoints when SSLCOMMERZ_SANDBOX is true", () => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "test-password");
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
    const config = getSslcommerzConfig();
    expect(config?.sandbox).toBe(true);
    expect(config?.baseUrl).toBe("https://sandbox.sslcommerz.com");
  });

  it("uses the live endpoints for any other SSLCOMMERZ_SANDBOX value", () => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "live-store");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "live-password");
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "false");
    expect(getSslcommerzConfig()?.baseUrl).toBe(
      "https://securepay.sslcommerz.com",
    );
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "");
    expect(getSslcommerzConfig()?.baseUrl).toBe(
      "https://securepay.sslcommerz.com",
    );
  });
});

describe("formatSslcommerzAmount / parseSslcommerzAmount", () => {
  it("formats an integer total as a decimal string", () => {
    expect(formatSslcommerzAmount(1583)).toBe("1583.00");
    expect(formatSslcommerzAmount(0)).toBe("0.00");
  });

  it("parses a decimal amount back to integer BDT", () => {
    expect(parseSslcommerzAmount("1583.00")).toBe(1583);
    expect(parseSslcommerzAmount("1543.42")).toBe(1543);
    expect(parseSslcommerzAmount(undefined)).toBeNull();
    expect(parseSslcommerzAmount("not-a-number")).toBeNull();
    expect(parseSslcommerzAmount("-5")).toBeNull();
  });
});

describe("initiateSslcommerzPayment", () => {
  beforeEach(() => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "test-password");
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
  });

  const input = {
    reference: "RB-2026-123456",
    totalBdt: 1583,
    customerName: "Rabby Hasan",
    customerEmail: "rabby@example.com",
    customerPhone: "01712345678",
    customerAddress: "House 12, Road 5, Dhanmondi, Dhaka",
    zone: "inside" as const,
    totalQuantity: 2,
    origin: "https://rabby-ecommerce-staging.vercel.app",
  };

  it("posts the order to the sandbox initiate endpoint and returns the session + gateway URL", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "SUCCESS",
        sessionkey: "test-session-key",
        GatewayPageURL:
          "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=TEST",
      }),
    );

    const result = await initiateSslcommerzPayment(input);

    expect(result).toEqual({
      sessionKey: "test-session-key",
      gatewayUrl:
        "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=TEST",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
    );
    expect(options.method).toBe("POST");
    const body = new URLSearchParams(options.body as string);
    expect(body.get("store_id")).toBe("test-store");
    expect(body.get("total_amount")).toBe("1583.00");
    expect(body.get("currency")).toBe("BDT");
    expect(body.get("tran_id")).toBe("RB-2026-123456");
    expect(body.get("success_url")).toBe(
      "https://rabby-ecommerce-staging.vercel.app/checkout/payment/success",
    );
    expect(body.get("fail_url")).toBe(
      "https://rabby-ecommerce-staging.vercel.app/checkout/payment/fail",
    );
    expect(body.get("cancel_url")).toBe(
      "https://rabby-ecommerce-staging.vercel.app/checkout/payment/cancel",
    );
    expect(body.get("ipn_url")).toBe(
      "https://rabby-ecommerce-staging.vercel.app/api/webhooks/sslcommerz",
    );
    expect(body.get("cus_name")).toBe("Rabby Hasan");
    expect(body.get("cus_email")).toBe("rabby@example.com");
    expect(body.get("cus_phone")).toBe("01712345678");
    expect(body.get("cus_city")).toBe("Dhaka");
    expect(body.get("cus_country")).toBe("Bangladesh");
    expect(body.get("product_name")).toBe("RabbY sunglasses order");
    expect(body.get("num_of_item")).toBe("2");
    // shipping_method is "NO": the gateway requires ship_* fields
    // for "Courier" and we do not use SSLCommerz logistics (see
    // lib/sslcommerz.ts) — "Courier" with no ship_* fields is
    // rejected by the sandbox with "'ship_name' is missing".
    expect(body.get("shipping_method")).toBe("NO");
    // The store password travels in the body — it must never be
    // logged; the client logs nothing, so assert the body carries
    // it (the gateway needs it) and nothing else asserts on it.
    expect(body.get("store_passwd")).toBe("test-password");
  });

  it("maps the city from the delivery zone (outside Dhaka -> Bangladesh)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "SUCCESS",
        sessionkey: "test-session-key",
        GatewayPageURL: "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php",
      }),
    );

    await initiateSslcommerzPayment({ ...input, zone: "outside" });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URLSearchParams(options.body as string).get("cus_city")).toBe(
      "Bangladesh",
    );
  });

  it("throws a plain-words error when the gateway reports FAILED", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "FAILED", failedreason: "Invalid store id" }),
    );

    await expect(initiateSslcommerzPayment(input)).rejects.toThrow(
      /could not be started/i,
    );
  });

  it("logs the gateway's reason (status + failedreason only) when the initiate is rejected", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "FAILED",
        failedreason: "Invalid Information! 'ship_name' is missing.",
      }),
    );

    await expect(initiateSslcommerzPayment(input)).rejects.toThrow(
      /could not be started/i,
    );
    expect(errorSpy).toHaveBeenCalledWith("[sslcommerz] initiate rejected", {
      status: "FAILED",
      failedreason: "Invalid Information! 'ship_name' is missing.",
    });
    // The request body carries the store password — it must never
    // be logged, so nothing in the log may contain it.
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain(
      "test-password",
    );
    errorSpy.mockRestore();
  });

  it("throws a plain-words error when the network fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(initiateSslcommerzPayment(input)).rejects.toThrow(
      /not available right now/i,
    );
  });

  it("throws when the gateway is not configured", async () => {
    vi.unstubAllEnvs();

    await expect(initiateSslcommerzPayment(input)).rejects.toThrow(
      /not available right now/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("validateSslcommerzTransaction / querySslcommerzTransaction", () => {
  beforeEach(() => {
    vi.stubEnv("SSLCOMMERZ_STORE_ID", "test-store");
    vi.stubEnv("SSLCOMMERZ_STORE_PASSWORD", "test-password");
    vi.stubEnv("SSLCOMMERZ_SANDBOX", "true");
  });

  it("calls the Validation API with the val_id and returns the parsed response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(VALIDATION_OK));

    const result = await validateSslcommerzTransaction("261126123456AbCdEf");

    expect(result.status).toBe("VALID");
    expect(result.tran_id).toBe("RB-2026-123456");
    expect(result.amount).toBe("1583.00");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php",
    );
    expect(url).toContain("val_id=261126123456AbCdEf");
  });

  it("throws when the Validation API cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(
      validateSslcommerzTransaction("261126123456AbCdEf"),
    ).rejects.toThrow(/could not verify/i);
  });

  it("accepts the Transaction Query response as a bare object", async () => {
    fetchMock.mockResolvedValue(jsonResponse(VALIDATION_OK));

    const result = await querySslcommerzTransaction("RB-2026-123456");

    expect(result.status).toBe("VALID");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("merchantTransIDvalidationAPI.php");
    expect(url).toContain("tran_id=RB-2026-123456");
  });

  it("accepts the Transaction Query response wrapped in an element array", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ element: [VALIDATION_OK] }));

    const result = await querySslcommerzTransaction("RB-2026-123456");

    expect(result.status).toBe("VALID");
    expect(result.tran_id).toBe("RB-2026-123456");
  });
});

describe("checkSslcommerzValidation", () => {
  const expected = { reference: "RB-2026-123456", totalBdt: 1583 };

  it("accepts a VALID response with matching tran_id, amount and BDT", () => {
    const verdict = checkSslcommerzValidation(VALIDATION_OK, expected);

    expect(verdict.paid).toBe(true);
    expect(verdict.gateway).toEqual({
      valId: "261126123456AbCdEf",
      bankTranId: "261126123456",
      cardBrand: "VISA",
      storeAmountBdt: 1543,
      riskLevel: 0,
    });
  });

  it("accepts VALIDATED as well as VALID", () => {
    expect(
      checkSslcommerzValidation(
        { ...VALIDATION_OK, status: "VALIDATED" },
        expected,
      ).paid,
    ).toBe(true);
  });

  it("rejects a forged val_id (INVALID_TRANSACTION)", () => {
    const verdict = checkSslcommerzValidation(
      { ...VALIDATION_OK, status: "INVALID_TRANSACTION" },
      expected,
    );

    expect(verdict.paid).toBe(false);
    expect(verdict.gateway).toBeNull();
  });

  it("rejects an amount-tampered response", () => {
    const verdict = checkSslcommerzValidation(
      { ...VALIDATION_OK, amount: "1.00" },
      expected,
    );

    expect(verdict.paid).toBe(false);
    expect(verdict.reason).toMatch(/amount/i);
  });

  it("rejects a response for a different order (wrong tran_id)", () => {
    const verdict = checkSslcommerzValidation(
      { ...VALIDATION_OK, tran_id: "RB-2026-999999" },
      expected,
    );

    expect(verdict.paid).toBe(false);
    expect(verdict.reason).toMatch(/tran_id/i);
  });

  it("rejects a non-BDT currency", () => {
    const verdict = checkSslcommerzValidation(
      { ...VALIDATION_OK, currency: "USD" },
      expected,
    );

    expect(verdict.paid).toBe(false);
    expect(verdict.reason).toMatch(/currency/i);
  });

  it("rejects a VALID response with no val_id", () => {
    const verdict = checkSslcommerzValidation(
      { ...VALIDATION_OK, val_id: undefined },
      expected,
    );

    expect(verdict.paid).toBe(false);
  });

  it("parses risk_level 1 as a flag (not a hold)", () => {
    const verdict = checkSslcommerzValidation(
      { ...VALIDATION_OK, risk_level: "1" },
      expected,
    );

    expect(verdict.paid).toBe(true);
    expect(verdict.gateway?.riskLevel).toBe(1);
  });
});

describe("sslcommerzStatusOutcome", () => {
  it("maps VALID / VALIDATED to paid", () => {
    expect(sslcommerzStatusOutcome("VALID")).toBe("paid");
    expect(sslcommerzStatusOutcome("VALIDATED")).toBe("paid");
  });

  it("maps FAILED / CANCELLED to failed", () => {
    expect(sslcommerzStatusOutcome("FAILED")).toBe("failed");
    expect(sslcommerzStatusOutcome("CANCELLED")).toBe("failed");
  });

  it("maps EXPIRED / UNATTEMPTED / INVALID_TRANSACTION to unknown — never failed", () => {
    expect(sslcommerzStatusOutcome("EXPIRED")).toBe("unknown");
    expect(sslcommerzStatusOutcome("UNATTEMPTED")).toBe("unknown");
    expect(sslcommerzStatusOutcome("INVALID_TRANSACTION")).toBe("unknown");
  });
});
