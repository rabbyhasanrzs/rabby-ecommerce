import {
  CouponInvalidError,
  createGuestOrder,
  GuestOrderError,
  lookupOrder,
  validateDiscountCode,
} from "@/lib/supabase/orders";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guest order error mapping (S-4 assembly fix).
 *
 * create_guest_order can raise 'payment_method_disabled' when the admin
 * turned a payment method off in Settings (migration 0005). That
 * message must map to a VALIDATION GuestOrderError with a plain-words
 * message — not a generic 500 ("Something went wrong."). The RPC is
 * mocked — no network, no database.
 */

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: rpcMock }),
}));

const validInput = {
  customer: {
    name: "Rabby Hasan",
    phone: "01712345678",
    email: "rabby@example.com",
    address: "House 12, Road 5, Dhanmondi, Dhaka",
    zone: "inside" as const,
    paymentMethod: "bkash" as const,
    paymentReference: "9A1B2C3D4E",
    paymentSender: "01712345678",
  },
  items: [{ slug: "sample-round-a", variantColour: "Black", quantity: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createGuestOrder error mapping", () => {
  it("maps payment_method_disabled to a VALIDATION error with a plain message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "payment_method_disabled" },
    });

    await expect(createGuestOrder(validInput)).rejects.toMatchObject({
      name: "GuestOrderError",
      message: "This payment method is currently unavailable. Please choose another.",
    });
    try {
      await createGuestOrder(validInput);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GuestOrderError);
      expect((error as GuestOrderError).code).toBe("VALIDATION");
    }
  });

  it("still maps invalid_* to VALIDATION (existing behaviour)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "invalid_payment_reference" },
    });

    await expect(createGuestOrder(validInput)).rejects.toMatchObject({
      name: "GuestOrderError",
    });
    try {
      await createGuestOrder(validInput);
      expect.unreachable();
    } catch (error) {
      expect((error as GuestOrderError).code).toBe("VALIDATION");
    }
  });

  it("leaves unknown errors as the generic failure (not mapped)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "something entirely unexpected" },
    });

    await expect(createGuestOrder(validInput)).rejects.toThrow(
      "Order could not be created. Please try again.",
    );
  });

  it("maps coupon_invalid to a VALIDATION error with one plain message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "coupon_invalid" },
    });

    await expect(createGuestOrder(validInput)).rejects.toMatchObject({
      name: "GuestOrderError",
      message: "This coupon code isn't valid. Check the code and try again.",
    });
    try {
      await createGuestOrder(validInput);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GuestOrderError);
      expect((error as GuestOrderError).code).toBe("VALIDATION");
    }
  });

  it("passes p_discount_code through to create_guest_order", async () => {
    rpcMock.mockResolvedValue({
      data: { reference: "RB-2026-123456", total_bdt: 1005 },
      error: null,
    });

    await createGuestOrder({ ...validInput, discountCode: "RE518" });

    expect(rpcMock).toHaveBeenCalledWith(
      "create_guest_order",
      expect.objectContaining({ p_discount_code: "RE518" }),
    );
  });

  it("passes p_discount_code null when no coupon was used", async () => {
    rpcMock.mockResolvedValue({
      data: { reference: "RB-2026-123456", total_bdt: 1110 },
      error: null,
    });

    await createGuestOrder(validInput);

    expect(rpcMock).toHaveBeenCalledWith(
      "create_guest_order",
      expect.objectContaining({ p_discount_code: null }),
    );
  });
});

describe("validateDiscountCode", () => {
  it("returns the percent off from the RPC", async () => {
    rpcMock.mockResolvedValue({ data: 10, error: null });

    await expect(validateDiscountCode("RE518")).resolves.toEqual({
      percentOff: 10,
    });
    expect(rpcMock).toHaveBeenCalledWith("validate_discount_code", {
      p_code: "RE518",
    });
  });

  it("throws CouponInvalidError on the coupon_invalid raise", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "coupon_invalid" },
    });

    await expect(validateDiscountCode("NOPE123")).rejects.toBeInstanceOf(
      CouponInvalidError,
    );
    try {
      await validateDiscountCode("NOPE123");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toBe(
        "This coupon code isn't valid. Check the code and try again.",
      );
    }
  });

  it("throws a generic error on an RPC failure that is not coupon_invalid", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "database is down" },
    });

    await expect(validateDiscountCode("RE518")).rejects.toThrow(
      "Coupon validation failed. Please try again.",
    );
  });

  it("throws a generic error when the RPC returns a bad percent", async () => {
    rpcMock.mockResolvedValue({ data: 0, error: null });

    await expect(validateDiscountCode("RE518")).rejects.toThrow(
      "Coupon validation failed. Please try again.",
    );
  });
});

describe("lookupOrder discount fields (S-7)", () => {
  const lookupRow = {
    reference: "RB-2026-123456",
    status: "placed",
    customer_name: "Rabby Hasan",
    customer_phone: "01712345678",
    delivery_address: "House 12, Road 5, Dhanmondi, Dhaka",
    delivery_zone: "inside",
    payment_method: "cod",
    payment_status: "cod",
    payment_reference: null,
    subtotal_bdt: 1000,
    tax_bdt: 45,
    delivery_fee_bdt: 60,
    total_bdt: 1005,
    discount_code: "RE518",
    discount_bdt: 100,
    created_at: "2026-11-23T00:00:00Z",
    items: [],
    events: [],
  };

  it("maps discount_code and discount_bdt from the lookup row", async () => {
    rpcMock.mockResolvedValue({ data: lookupRow, error: null });

    const order = await lookupOrder("RB-2026-123456", "01712345678");

    expect(order?.discountCode).toBe("RE518");
    expect(order?.discountBdt).toBe(100);
  });

  it("falls back to null / 0 when the row predates migration 0009", async () => {
    const { discount_code: _code, discount_bdt: _amount, ...oldRow } =
      lookupRow;
    // The stripped fields are the pre-0009 values being removed.
    expect(_code).toBe("RE518");
    expect(_amount).toBe(100);
    rpcMock.mockResolvedValue({ data: oldRow, error: null });

    const order = await lookupOrder("RB-2026-123456", "01712345678");

    expect(order?.discountCode).toBeNull();
    expect(order?.discountBdt).toBe(0);
  });
});
