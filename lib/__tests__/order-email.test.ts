/**
 * @vitest-environment node
 */
import {
  buildOrderConfirmationEmail,
  buildOrderStatusEmail,
  isOrderStatusEmailTrigger,
  ORDER_STATUS_EMAIL_TRIGGERS,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
  type OrderStatusEmailOrder,
} from "@/lib/order-email";
import type { AdminOrderDetail } from "@/app/admin/(protected)/admin-data";
import type { OrderDetail } from "@/lib/supabase/orders";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMailMock, lookupOrderMock, adminGetOrderMock, logAttemptMock } =
  vi.hoisted(() => ({
    sendMailMock: vi.fn(),
    lookupOrderMock: vi.fn(),
    adminGetOrderMock: vi.fn(),
    logAttemptMock: vi.fn(),
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

vi.mock("@/app/admin/(protected)/admin-data", () => ({
  adminGetOrder: adminGetOrderMock,
  logNotificationAttempt: logAttemptMock,
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

const STATUS_ORDER: OrderStatusEmailOrder = {
  reference: "RB-2026-123456",
  customerName: "Rabby Hasan",
  items: [
    {
      productName: "SAMPLE Aviator A",
      variantColour: "Gold",
      quantity: 1,
      lineTotalBdt: 1450,
    },
  ],
  totalBdt: 1583,
};

const ADMIN_ORDER_FIXTURE: AdminOrderDetail = {
  order: {
    id: "order-id",
    reference: "RB-2026-123456",
    customer_name: "Rabby Hasan",
    customer_phone: "01712345678",
    customer_email: CUSTOMER_EMAIL,
    address: "House 12, Road 5, Dhanmondi, Dhaka",
    zone: "inside",
    payment_method: "cod",
    payment_status: "cod",
    payment_reference: null,
    total_bdt: 1583,
    subtotal_bdt: 1450,
    tax_bdt: 73,
    delivery_fee_bdt: 60,
    discount_code: null,
    discount_bdt: null,
    status: "confirmed",
    created_at: "2026-11-22T10:00:00.000Z",
  },
  items: [
    {
      slug: "sample-aviator-a",
      name: "SAMPLE Aviator A",
      price_bdt: 1450,
      variant_colour: "Gold",
      quantity: 1,
    },
  ],
  status_events: [],
  payment: { method: "cod", status: "cod", reference: null, sender: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sendMailMock.mockResolvedValue({ messageId: "mock-message-id" });
  lookupOrderMock.mockResolvedValue(ORDER_FIXTURE);
  adminGetOrderMock.mockResolvedValue(ADMIN_ORDER_FIXTURE);
  logAttemptMock.mockResolvedValue(undefined);
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

describe("ORDER_STATUS_EMAIL_TRIGGERS", () => {
  it("covers every forward step plus Cancelled — and nothing else", () => {
    expect([...ORDER_STATUS_EMAIL_TRIGGERS]).toEqual([
      "confirmed",
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ]);
    // Placed is excluded (the confirmation email covers it);
    // Returned / Refunded / Failed do not trigger an email in v1.
    for (const excluded of ["placed", "returned", "refunded", "failed"]) {
      expect(isOrderStatusEmailTrigger(excluded)).toBe(false);
    }
    for (const trigger of ORDER_STATUS_EMAIL_TRIGGERS) {
      expect(isOrderStatusEmailTrigger(trigger)).toBe(true);
    }
  });
});

describe("buildOrderStatusEmail", () => {
  const STATUS_LABELS: Record<string, string> = {
    confirmed: "Confirmed",
    processing: "Processing",
    packed: "Packed",
    shipped: "Shipped",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  it("has the right subject, status line, items, total, and track link per status", () => {
    for (const status of ORDER_STATUS_EMAIL_TRIGGERS) {
      const email = buildOrderStatusEmail(
        STATUS_ORDER,
        CUSTOMER_EMAIL,
        SENDER,
        status,
      );
      const label = STATUS_LABELS[status];
      expect(email.from).toBe(`RabbY <${SENDER}>`);
      expect(email.to).toBe(CUSTOMER_EMAIL);
      expect(email.subject).toBe(
        `Your RabbY order RB-2026-123456 is now ${label}`,
      );
      for (const body of [email.text, email.html]) {
        expect(body).toContain("RB-2026-123456");
        expect(body).toContain(label);
        expect(body).toContain("SAMPLE Aviator A");
        expect(body).toContain("Gold");
        expect(body).toContain("৳1,450");
        expect(body).toContain("৳1,583");
        expect(body).toContain(
          "https://rabby-ecommerce-uhrm.vercel.app/orders?ref=RB-2026-123456",
        );
      }
    }
  });

  it("includes the cancel reason only for a cancelled order", () => {
    const cancelled = buildOrderStatusEmail(
      STATUS_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
      "cancelled",
      "Customer asked to cancel",
    );
    expect(cancelled.text).toContain("Reason: Customer asked to cancel");
    expect(cancelled.html).toContain("Reason: Customer asked to cancel");

    const shipped = buildOrderStatusEmail(
      STATUS_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
      "shipped",
      "Customer asked to cancel",
    );
    expect(shipped.text).not.toContain("Customer asked to cancel");
    expect(shipped.html).not.toContain("Customer asked to cancel");
  });

  it("escapes HTML in item names and the cancel reason", () => {
    const evilOrder: OrderStatusEmailOrder = {
      ...STATUS_ORDER,
      items: [
        {
          productName: "<script>alert(1)</script>",
          variantColour: null,
          quantity: 1,
          lineTotalBdt: 100,
        },
      ],
    };
    const email = buildOrderStatusEmail(
      evilOrder,
      CUSTOMER_EMAIL,
      SENDER,
      "cancelled",
      "<b>evil reason</b>",
    );
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).not.toContain("<b>evil reason</b>");
    expect(email.html).toContain("&lt;b&gt;evil reason&lt;/b&gt;");
  });
});

describe("sendOrderStatusEmail", () => {
  function withGmailConfigured() {
    vi.stubEnv("GMAIL_USER", SENDER);
    vi.stubEnv("GMAIL_APP_PASSWORD", "mock-app-password");
  }

  it("skips without fetching or sending for an excluded status", async () => {
    withGmailConfigured();
    for (const status of ["placed", "returned", "refunded", "failed"]) {
      const result = await sendOrderStatusEmail({
        reference: "RB-2026-123456",
        status,
        previousStatus: "delivered",
      });
      expect(result).toEqual({
        status: "skipped",
        reason: "status does not trigger an email",
      });
    }
    expect(adminGetOrderMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(logAttemptMock).not.toHaveBeenCalled();
  });

  it("skips without sending when the status did not change (same-status re-save)", async () => {
    withGmailConfigured();
    const result = await sendOrderStatusEmail({
      reference: "RB-2026-123456",
      status: "confirmed",
      previousStatus: "confirmed",
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "status unchanged",
    });
    expect(adminGetOrderMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("skips silently when the env vars are missing (no fetch, no send)", async () => {
    const result = await sendOrderStatusEmail({
      reference: "RB-2026-123456",
      status: "confirmed",
      previousStatus: "placed",
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "email not configured",
    });
    expect(adminGetOrderMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("sends via Gmail SMTP and logs the sent attempt", async () => {
    withGmailConfigured();
    const result = await sendOrderStatusEmail({
      reference: "RB-2026-123456",
      status: "confirmed",
      previousStatus: "placed",
    });
    expect(result).toEqual({ status: "sent" });
    expect(adminGetOrderMock).toHaveBeenCalledWith("RB-2026-123456");
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0][0];
    expect(sent.from).toBe(`RabbY <${SENDER}>`);
    expect(sent.to).toBe(CUSTOMER_EMAIL);
    expect(sent.subject).toBe(
      "Your RabbY order RB-2026-123456 is now Confirmed",
    );
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderReference: "RB-2026-123456",
        type: "order_status",
        status: "confirmed",
        recipient: CUSTOMER_EMAIL,
        result: "sent",
      }),
    );
  });

  it("returns failed (never throws) when the order is not found", async () => {
    withGmailConfigured();
    adminGetOrderMock.mockResolvedValue(null);
    const result = await sendOrderStatusEmail({
      reference: "RB-2026-000000",
      status: "shipped",
      previousStatus: "packed",
    });
    expect(result).toEqual({ status: "failed", reason: "order not found" });
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ result: "failed", error: "order not found" }),
    );
  });

  it("returns failed (never throws) when the order has no customer email", async () => {
    withGmailConfigured();
    adminGetOrderMock.mockResolvedValue({
      ...ADMIN_ORDER_FIXTURE,
      order: { ...ADMIN_ORDER_FIXTURE.order, customer_email: null },
    });
    const result = await sendOrderStatusEmail({
      reference: "RB-2026-123456",
      status: "shipped",
      previousStatus: "packed",
    });
    expect(result).toEqual({
      status: "failed",
      reason: "no customer email",
    });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("returns failed (never throws) when Gmail rejects the send", async () => {
    withGmailConfigured();
    sendMailMock.mockRejectedValue(new Error("Invalid credentials"));
    const result = await sendOrderStatusEmail({
      reference: "RB-2026-123456",
      status: "delivered",
      previousStatus: "out_for_delivery",
    });
    expect(result).toEqual({ status: "failed", reason: "send failed" });
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ result: "failed", error: "send failed" }),
    );
  });

  it("returns failed (never throws) when the admin order fetch throws", async () => {
    withGmailConfigured();
    adminGetOrderMock.mockRejectedValue(new Error("Admin request failed"));
    const result = await sendOrderStatusEmail({
      reference: "RB-2026-123456",
      status: "confirmed",
      previousStatus: "placed",
    });
    expect(result).toEqual({ status: "failed", reason: "send failed" });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("still reports sent when the log write itself fails", async () => {
    withGmailConfigured();
    logAttemptMock.mockRejectedValue(new Error("log write failed"));
    const result = await sendOrderStatusEmail({
      reference: "RB-2026-123456",
      status: "confirmed",
      previousStatus: "placed",
    });
    expect(result).toEqual({ status: "sent" });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});
