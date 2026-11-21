import { checkoutFormSchema } from "@/lib/checkout-validation";
import { describe, expect, it } from "vitest";

const VALID = {
  name: "Rabby Hasan",
  phone: "01712345678",
  email: "rabby@example.com",
  address: "House 12, Road 5, Dhanmondi, Dhaka",
  zone: "inside",
  paymentMethod: "cod",
} as const;

const VALID_MOBILE_BANKING = {
  ...VALID,
  paymentMethod: "bkash",
  paymentReference: "9A1B2C3D4E",
  paymentSender: "01712345678",
} as const;

function issueMessages(result: ReturnType<typeof checkoutFormSchema.safeParse>) {
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

describe("checkoutFormSchema payment details (S-3, demo-safe)", () => {
  it("passes bkash with a TrxID and sender number", () => {
    const parsed = checkoutFormSchema.safeParse(VALID_MOBILE_BANKING);
    expect(parsed.success).toBe(true);
  });

  it("passes nagad and rocket with the same details", () => {
    for (const paymentMethod of ["nagad", "rocket"] as const) {
      const parsed = checkoutFormSchema.safeParse({
        ...VALID_MOBILE_BANKING,
        paymentMethod,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects bkash without a TrxID", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID_MOBILE_BANKING,
      paymentReference: "",
    });
    expect(parsed.success).toBe(false);
    expect(issueMessages(parsed)).toContainEqual({
      path: "paymentReference",
      message: "Enter the Transaction ID from your payment.",
    });
  });

  it("rejects a TrxID shorter than 8 or longer than 12 characters", () => {
    for (const paymentReference of ["ABC123", "9A1B2C3D4E5F6"]) {
      const parsed = checkoutFormSchema.safeParse({
        ...VALID_MOBILE_BANKING,
        paymentReference,
      });
      expect(parsed.success).toBe(false);
      expect(issueMessages(parsed)).toContainEqual({
        path: "paymentReference",
        message: "Enter the Transaction ID from your payment.",
      });
    }
  });

  it("rejects a TrxID with non-alphanumeric characters", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID_MOBILE_BANKING,
      paymentReference: "9A1B-2C3D4E",
    });
    expect(parsed.success).toBe(false);
    expect(issueMessages(parsed)).toContainEqual({
      path: "paymentReference",
      message: "Enter the Transaction ID from your payment.",
    });
  });

  it("trims a TrxID with surrounding spaces and passes", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID_MOBILE_BANKING,
      paymentReference: "  9A1B2C3D4E  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.paymentReference).toBe("9A1B2C3D4E");
    }
  });

  it("rejects bkash without a sender number", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID_MOBILE_BANKING,
      paymentSender: "",
    });
    expect(parsed.success).toBe(false);
    expect(issueMessages(parsed)).toContainEqual({
      path: "paymentSender",
      message: "Enter a valid Bangladeshi mobile number (01XXXXXXXXX).",
    });
  });

  it("rejects a sender number that is not a Bangladeshi mobile", () => {
    for (const paymentSender of ["01234567890", "0171234567", "not-a-number"]) {
      const parsed = checkoutFormSchema.safeParse({
        ...VALID_MOBILE_BANKING,
        paymentSender,
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("normalises a +880 sender number", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID_MOBILE_BANKING,
      paymentSender: "+8801712345678",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.paymentSender).toBe("01712345678");
    }
  });

  it("rejects a TrxID sent with COD", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID,
      paymentReference: "9A1B2C3D4E",
    });
    expect(parsed.success).toBe(false);
    expect(issueMessages(parsed)).toContainEqual({
      path: "paymentReference",
      message: "Transaction ID is only needed for mobile banking.",
    });
  });

  it("rejects a sender number sent with card", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID,
      paymentMethod: "card",
      paymentSender: "01712345678",
    });
    expect(parsed.success).toBe(false);
    expect(issueMessages(parsed)).toContainEqual({
      path: "paymentSender",
      message: "Sender number is only needed for mobile banking.",
    });
  });

  it("passes COD and card with no payment details", () => {
    for (const paymentMethod of ["cod", "card"] as const) {
      const parsed = checkoutFormSchema.safeParse({ ...VALID, paymentMethod });
      expect(parsed.success).toBe(true);
    }
  });
});
