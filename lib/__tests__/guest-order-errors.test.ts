import {
  createGuestOrder,
  GuestOrderError,
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
});
