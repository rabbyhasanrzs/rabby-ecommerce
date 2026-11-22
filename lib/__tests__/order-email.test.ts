/**
 * @vitest-environment node
 */
import {
  buildOrderConfirmationEmail,
  sendOrderConfirmationEmail,
} from "@/lib/order-email";
import type { OrderDetail } from "@/lib/supabase/orders";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMailMock, lookupOrderMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn(),
  lookupOrderMock: vi.fn(),
}));

/**
 * The email module must never send a real email in tests: mock the
 * transporter (not the network) and the order lookup.
 */
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
}));

vi.mock("@/lib/supabase/orders", () => ({
  isMobileBankingMethod: (method: string) =>
    ["bkash", "nagad", "rocket"].includes(method),
  lookupOrder: lookupOrderMock,
  paymentStatusLabel: (status: string | undefined, method: string) => {
    const resolved = status ?? (method === "cod" ? "cod" : "pending");
    if (resolved === "cod") {
      return "Cash on Delivery — pay when your order arrives";
    }
    return "Payment pending verification";
  },
}));

const ORDER_FIXTURE: OrderDetail = {
  reference: "RB-2026-123456",
  status: "placed",
  customerName: "Rabby Hasan",
  customerPhone: "01712345678",
  customerEmail: null,
  deliveryAddress: "House 12, Road 5, Dhanmondi, Dhaka",
  deliveryZone: "inside",
  paymentMethod: "cod",
  paymentStatus: "cod",
  paymentReference: null,
  paymentSender: null,
  subtotalBdt: 1450,
  taxBdt: 73,
  deliveryFeeBdt: 60,
  totalBdt: 1583,
  createdAt: "2026-11-22T10:00:00.000Z",
  items: [
    {
      productSlug: "sample-aviator-a",
      productName: "SAMPLE Aviator A",
      variantColour: "Gold",
      unitPriceBdt: 1450,
      quantity: 1,
      lineTotalBdt: 1450,
    },
  ],
  events: [],
};

const SENDER = "rabbyhasanrzs5183@gmail.com";
const CUSTOMER_EMAIL = "customer@example.com";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sendMailMock.mockResolvedValue({ messageId: "mock-message-id" });
  lookupOrderMock.mockResolvedValue(ORDER_FIXTURE);
});

describe("buildOrderConfirmationEmail", () => {
  it("contains the reference, items, totals, payment, delivery, and track link", () => {
    const email = buildOrderConfirmationEmail(
      ORDER_FIXTURE,
      CUSTOMER_EMAIL,
      SENDER,
    );
    expect(email.from).toBe(`RabbY <${SENDER}>`);
    expect(email.to).toBe(CUSTOMER_EMAIL);
    expect(email.subject).toContain("RB-2026-123456");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("RB-2026-123456");
      expect(body).toContain("SAMPLE Aviator A");
      expect(body).toContain("Gold");
      expect(body).toContain("৳1,450");
      expect(body).toContain("৳73");
      expect(body).toContain("৳60");
      expect(body).toContain("৳1,583");
      expect(body).toContain("Cash on Delivery");
      expect(body).toContain("Inside Dhaka");
      expect(body).toContain("1–2 days");
      expect(body).toContain(
        "https://rabby-ecommerce-uhrm.vercel.app/orders?ref=RB-2026-123456",
      );
    }
  });

  it("shows the Transaction ID for mobile banking, never the sender number", () => {
    const bkashOrder: OrderDetail = {
      ...ORDER_FIXTURE,
      paymentMethod: "bkash",
      paymentStatus: "pending",
      paymentReference: "TRX12345678",
      paymentSender: "01799999999",
    };
    const email = buildOrderConfirmationEmail(
      bkashOrder,
      CUSTOMER_EMAIL,
      SENDER,
    );
    expect(email.text).toContain("bKash");
    expect(email.text).toContain("Transaction ID: TRX12345678");
    expect(email.text).not.toContain("01799999999");
    expect(email.html).not.toContain("01799999999");
  });

  it("escapes HTML in item names", () => {
    const evilOrder: OrderDetail = {
      ...ORDER_FIXTURE,
      items: [
        {
          productSlug: "sample-evil",
          productName: "<script>alert(1)</script>",
          variantColour: null,
          unitPriceBdt: 100,
          quantity: 1,
          lineTotalBdt: 100,
        },
      ],
    };
    const email = buildOrderConfirmationEmail(
      evilOrder,
      CUSTOMER_EMAIL,
      SENDER,
    );
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("sendOrderConfirmationEmail", () => {
  it("skips silently when the env vars are missing (no transport, no lookup)", async () => {
    const result = await sendOrderConfirmationEmail({
      reference: "RB-2026-123456",
      phone: "01712345678",
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "email not configured",
    });
    expect(lookupOrderMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("skips when only one env var is set", async () => {
    vi.stubEnv("GMAIL_USER", SENDER);
    const result = await sendOrderConfirmationEmail({
      reference: "RB-2026-123456",
      phone: "01712345678",
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result.status).toBe("skipped");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("sends via Gmail SMTP with the env sender when configured", async () => {
    vi.stubEnv("GMAIL_USER", SENDER);
    vi.stubEnv("GMAIL_APP_PASSWORD", "mock-app-password");
    const result = await sendOrderConfirmationEmail({
      reference: "RB-2026-123456",
      phone: "01712345678",
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result).toEqual({ status: "sent" });
    expect(lookupOrderMock).toHaveBeenCalledWith(
      "RB-2026-123456",
      "01712345678",
    );
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0][0];
    expect(sent.from).toBe(`RabbY <${SENDER}>`);
    expect(sent.to).toBe(CUSTOMER_EMAIL);
    expect(sent.subject).toContain("RB-2026-123456");
  });

  it("returns failed (never throws) when the order lookup finds nothing", async () => {
    vi.stubEnv("GMAIL_USER", SENDER);
    vi.stubEnv("GMAIL_APP_PASSWORD", "mock-app-password");
    lookupOrderMock.mockResolvedValue(null);
    const result = await sendOrderConfirmationEmail({
      reference: "RB-2026-000000",
      phone: "01712345678",
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result).toEqual({ status: "failed", reason: "order not found" });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("returns failed (never throws) when Gmail rejects the send", async () => {
    vi.stubEnv("GMAIL_USER", SENDER);
    vi.stubEnv("GMAIL_APP_PASSWORD", "mock-app-password");
    sendMailMock.mockRejectedValue(new Error("Invalid credentials"));
    const result = await sendOrderConfirmationEmail({
      reference: "RB-2026-123456",
      phone: "01712345678",
      customerEmail: CUSTOMER_EMAIL,
    });
    expect(result).toEqual({ status: "failed", reason: "send failed" });
  });
});
