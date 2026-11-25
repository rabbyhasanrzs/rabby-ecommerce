import { stockAlertSubscribeSchema } from "@/lib/api-schemas";
import {
  StockAlertError,
  subscribeStockAlert,
  unsubscribeStockAlert,
} from "@/lib/stock-alerts";
import { SupabaseNotConfiguredError } from "@/lib/supabase/orders";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, getClientMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  getClientMock: vi.fn(),
}));

/** Stock alerts only use the anon client + RPCs — mock those, not the network. */
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: getClientMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  getClientMock.mockReturnValue({ rpc: rpcMock });
  rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
});

// ---------------------------------------------------------------------------
// stockAlertSubscribeSchema
// ---------------------------------------------------------------------------

describe("stockAlertSubscribeSchema", () => {
  it("accepts a valid email and slug", () => {
    const parsed = stockAlertSubscribeSchema.safeParse({
      productSlug: "sample-futuristic",
      email: "customer@example.com",
    });
    expect(parsed.success).toBe(true);
  });

  it("trims and lowercases nothing itself — the function normalises", () => {
    const parsed = stockAlertSubscribeSchema.safeParse({
      productSlug: "sample-futuristic",
      email: "  Customer@Example.COM  ",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid email with the checkout message", () => {
    const parsed = stockAlertSubscribeSchema.safeParse({
      productSlug: "sample-futuristic",
      email: "not-an-email",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "Enter a valid email address.",
      );
    }
  });

  it("rejects an empty slug", () => {
    const parsed = stockAlertSubscribeSchema.safeParse({
      productSlug: "",
      email: "customer@example.com",
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subscribeStockAlert
// ---------------------------------------------------------------------------

describe("subscribeStockAlert", () => {
  it("calls subscribe_stock_alert with the slug and email", async () => {
    const result = await subscribeStockAlert({
      productSlug: "sample-futuristic",
      email: "customer@example.com",
    });
    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("subscribe_stock_alert", {
      p_product_slug: "sample-futuristic",
      p_email: "customer@example.com",
    });
  });

  it("maps product_not_found to plain words", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, error: "product_not_found" },
      error: null,
    });
    await expect(
      subscribeStockAlert({
        productSlug: "no-such-product",
        email: "customer@example.com",
      }),
    ).rejects.toThrow("That product couldn't be found.");
    await expect(
      subscribeStockAlert({
        productSlug: "no-such-product",
        email: "customer@example.com",
      }),
    ).rejects.toBeInstanceOf(StockAlertError);
  });

  it("maps product_in_stock to plain words", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, error: "product_in_stock" },
      error: null,
    });
    await expect(
      subscribeStockAlert({
        productSlug: "sample-round-a",
        email: "customer@example.com",
      }),
    ).rejects.toThrow("This product is in stock now — you can order it.");
  });

  it("maps invalid_email to the checkout message", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, error: "invalid_email" },
      error: null,
    });
    await expect(
      subscribeStockAlert({
        productSlug: "sample-futuristic",
        email: "not-an-email",
      }),
    ).rejects.toThrow("Enter a valid email address.");
  });

  it("throws a generic error when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(
      subscribeStockAlert({
        productSlug: "sample-futuristic",
        email: "customer@example.com",
      }),
    ).rejects.toThrow("Your request couldn't be saved. Please try again.");
  });

  it("throws SupabaseNotConfiguredError when the env vars are missing", async () => {
    getClientMock.mockReturnValue(null);
    await expect(
      subscribeStockAlert({
        productSlug: "sample-futuristic",
        email: "customer@example.com",
      }),
    ).rejects.toBeInstanceOf(SupabaseNotConfiguredError);
  });
});

// ---------------------------------------------------------------------------
// unsubscribeStockAlert
// ---------------------------------------------------------------------------

describe("unsubscribeStockAlert", () => {
  const TOKEN = "123e4567-e89b-12d3-a456-426614174000";

  it("calls unsubscribe_stock_alert with the token", async () => {
    const result = await unsubscribeStockAlert(TOKEN);
    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("unsubscribe_stock_alert", {
      p_token: TOKEN,
    });
  });

  it("throws a generic error when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(unsubscribeStockAlert(TOKEN)).rejects.toThrow(
      "Your request couldn't be saved. Please try again.",
    );
  });

  it("throws SupabaseNotConfiguredError when the env vars are missing", async () => {
    getClientMock.mockReturnValue(null);
    await expect(unsubscribeStockAlert(TOKEN)).rejects.toBeInstanceOf(
      SupabaseNotConfiguredError,
    );
  });
});
