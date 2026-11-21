import {
  checkoutFormSchema,
  normalizePhone,
} from "@/lib/checkout-validation";
import { describe, expect, it } from "vitest";

const VALID = {
  name: "Rabby Hasan",
  phone: "01712345678",
  email: "rabby@example.com",
  address: "House 12, Road 5, Dhanmondi, Dhaka",
  zone: "inside",
  paymentMethod: "cod",
} as const;

describe("normalizePhone", () => {
  it("normalises +880 and 880 prefixes to 01", () => {
    expect(normalizePhone("+8801712345678")).toBe("01712345678");
    expect(normalizePhone("8801712345678")).toBe("01712345678");
    expect(normalizePhone("01712345678")).toBe("01712345678");
  });

  it("strips spaces and dashes", () => {
    expect(normalizePhone("0171-234 5678")).toBe("01712345678");
  });
});

describe("checkoutFormSchema", () => {
  it("passes valid data and normalises a +880 phone", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID,
      phone: "+8801712345678",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.phone).toBe("01712345678");
    }
  });

  it("rejects a phone with the wrong length", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID,
      phone: "0171234567",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/valid Bangladeshi/);
    }
  });

  it("rejects a phone without the 01 prefix", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID,
      phone: "02123456789",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a bad email", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID,
      email: "not-an-email",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/valid email/);
    }
  });

  it("rejects a short name", () => {
    const parsed = checkoutFormSchema.safeParse({ ...VALID, name: "R" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/full name/);
    }
  });

  it("rejects a short address", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID,
      address: "Dhaka",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(
        /full delivery address/,
      );
    }
  });

  it("rejects a bad delivery zone", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID,
      zone: "middle",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a bad payment method", () => {
    const parsed = checkoutFormSchema.safeParse({
      ...VALID,
      paymentMethod: "cash",
    });
    expect(parsed.success).toBe(false);
  });
});
