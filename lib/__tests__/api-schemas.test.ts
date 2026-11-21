import {
  bagValidateRequestSchema,
  cancelRequestSchema,
  checkoutRequestSchema,
  lookupRequestSchema,
} from "@/lib/api-schemas";
import { describe, expect, it } from "vitest";

const validCustomer = {
  name: "Rabby Hasan",
  phone: "01712345678",
  email: "rabby@example.com",
  address: "123 Test Street, Dhanmondi, Dhaka",
  zone: "inside",
  paymentMethod: "cod",
} as const;

const validItems = [
  { slug: "sample-round-a", variantColour: "Black", quantity: 2 },
];

// ---------------------------------------------------------------------------
// bagValidateRequestSchema
// ---------------------------------------------------------------------------

describe("bagValidateRequestSchema", () => {
  it("accepts a valid bag with and without a client price", () => {
    expect(
      bagValidateRequestSchema.safeParse({
        items: [
          { slug: "sample-round-a", quantity: 2, priceBdt: 950 },
          { slug: "sample-aviator-a", quantity: 1 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid slug", () => {
    expect(
      bagValidateRequestSchema.safeParse({
        items: [{ slug: "BAD SLUG", quantity: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects quantity 0 and quantity 100", () => {
    expect(
      bagValidateRequestSchema.safeParse({
        items: [{ slug: "sample-round-a", quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      bagValidateRequestSchema.safeParse({
        items: [{ slug: "sample-round-a", quantity: 100 }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty items array and more than 20 items", () => {
    expect(bagValidateRequestSchema.safeParse({ items: [] }).success).toBe(
      false,
    );
    expect(
      bagValidateRequestSchema.safeParse({
        items: Array.from({ length: 21 }, (_, i) => ({
          slug: `sample-round-${i}`,
          quantity: 1,
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects a missing items field", () => {
    expect(bagValidateRequestSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkoutRequestSchema
// ---------------------------------------------------------------------------

describe("checkoutRequestSchema", () => {
  it("accepts a valid checkout body", () => {
    const parsed = checkoutRequestSchema.safeParse({
      customer: validCustomer,
      items: validItems,
    });
    expect(parsed.success).toBe(true);
  });

  it("normalises the phone number (+880… -> 01…)", () => {
    const parsed = checkoutRequestSchema.safeParse({
      customer: { ...validCustomer, phone: "+8801712345678" },
      items: validItems,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customer.phone).toBe("01712345678");
    }
  });

  it("rejects a bad phone number", () => {
    expect(
      checkoutRequestSchema.safeParse({
        customer: { ...validCustomer, phone: "01234" },
        items: validItems,
      }).success,
    ).toBe(false);
  });

  it("rejects missing customer fields", () => {
    const { phone, email, address, zone, paymentMethod } = validCustomer;
    expect(
      checkoutRequestSchema.safeParse({
        customer: { phone, email, address, zone, paymentMethod },
        items: validItems,
      }).success,
    ).toBe(false);
    const { name, address: address2, zone: zone2, paymentMethod: payment2 } =
      validCustomer;
    expect(
      checkoutRequestSchema.safeParse({
        customer: {
          name,
          phone: "01712345678",
          address: address2,
          zone: zone2,
          paymentMethod: payment2,
        },
        items: validItems,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid slug and quantity 0 / 100", () => {
    expect(
      checkoutRequestSchema.safeParse({
        customer: validCustomer,
        items: [{ slug: "BAD", variantColour: null, quantity: 1 }],
      }).success,
    ).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({
        customer: validCustomer,
        items: [{ slug: "sample-round-a", variantColour: null, quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({
        customer: validCustomer,
        items: [
          { slug: "sample-round-a", variantColour: null, quantity: 100 },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty items array", () => {
    expect(
      checkoutRequestSchema.safeParse({
        customer: validCustomer,
        items: [],
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lookupRequestSchema / cancelRequestSchema
// ---------------------------------------------------------------------------

describe("lookupRequestSchema", () => {
  it("accepts a valid reference and phone", () => {
    expect(
      lookupRequestSchema.safeParse({
        reference: "RB-2026-123456",
        phone: "01712345678",
      }).success,
    ).toBe(true);
  });

  it("rejects a bad reference format", () => {
    expect(
      lookupRequestSchema.safeParse({
        reference: "RB-2026-12345",
        phone: "01712345678",
      }).success,
    ).toBe(false);
    expect(
      lookupRequestSchema.safeParse({
        reference: "rb-2026-123456",
        phone: "01712345678",
      }).success,
    ).toBe(false);
  });

  it("rejects a bad phone number and missing fields", () => {
    expect(
      lookupRequestSchema.safeParse({
        reference: "RB-2026-123456",
        phone: "01234",
      }).success,
    ).toBe(false);
    expect(
      lookupRequestSchema.safeParse({ reference: "RB-2026-123456" }).success,
    ).toBe(false);
    expect(
      lookupRequestSchema.safeParse({ phone: "01712345678" }).success,
    ).toBe(false);
  });
});

describe("cancelRequestSchema", () => {
  it("accepts the same shape as lookup", () => {
    expect(
      cancelRequestSchema.safeParse({
        reference: "RB-2026-123456",
        phone: "01712345678",
      }).success,
    ).toBe(true);
    expect(
      cancelRequestSchema.safeParse({
        reference: "RB-2026-12345",
        phone: "01712345678",
      }).success,
    ).toBe(false);
  });
});
