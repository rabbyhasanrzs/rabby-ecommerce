/**
 * @vitest-environment node
 */
import {
  buildBackInStockEmail,
  buildOrderConfirmationEmail,
  buildOrderStatusEmail,
  buildPaymentFailedEmail,
  isOrderStatusEmailTrigger,
  ORDER_STATUS_EMAIL_TRIGGERS,
  sendBackInStockAlert,
  sendBackInStockAlertsForProduct,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
  sendPaymentFailedEmail,
  type OrderStatusEmailOrder,
  type PaymentFailedEmailOrder,
} from "@/lib/order-email";
import type { AdminOrderDetail } from "@/app/admin/(protected)/admin-data";
import type { OrderDetail } from "@/lib/supabase/orders";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sendMailMock,
  lookupOrderMock,
  adminGetOrderMock,
  logAttemptMock,
  listAlertsMock,
  claimAlertsMock,
} = vi.hoisted(() => ({
  sendMailMock: vi.fn(),
  lookupOrderMock: vi.fn(),
  adminGetOrderMock: vi.fn(),
  logAttemptMock: vi.fn(),
  listAlertsMock: vi.fn(),
  claimAlertsMock: vi.fn(),
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
  adminListStockAlertSubscriptions: listAlertsMock,
  adminClaimStockAlerts: claimAlertsMock,
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

const PAYMENT_FAILED_ORDER: PaymentFailedEmailOrder = {
  ...STATUS_ORDER,
  paymentMethod: "bkash",
  paymentReference: "TRX12345678",
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
  payment: {
    method: "cod",
    status: "cod",
    reference: null,
    sender: null,
    gateway_session_key: null,
    gateway_val_id: null,
    gateway_bank_tran_id: null,
    gateway_card_brand: null,
    gateway_store_amount_bdt: null,
    gateway_risk_level: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sendMailMock.mockResolvedValue({ messageId: "mock-message-id" });
  lookupOrderMock.mockResolvedValue(ORDER_FIXTURE);
  adminGetOrderMock.mockResolvedValue(ADMIN_ORDER_FIXTURE);
  logAttemptMock.mockResolvedValue(undefined);
  listAlertsMock.mockResolvedValue([]);
  claimAlertsMock.mockResolvedValue([]);
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
  it("covers every forward step plus Cancelled, Returned, and Refunded — and nothing else", () => {
    expect([...ORDER_STATUS_EMAIL_TRIGGERS]).toEqual([
      "confirmed",
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "returned",
      "refunded",
    ]);
    // Placed is excluded (the confirmation email covers it);
    // Failed is excluded (no live path sets the order status).
    for (const excluded of ["placed", "failed"]) {
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
    returned: "Returned",
    refunded: "Refunded",
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

  it("uses the approved meaning lines for returned and refunded", () => {
    const returned = buildOrderStatusEmail(
      STATUS_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
      "returned",
    );
    expect(returned.subject).toBe(
      "Your RabbY order RB-2026-123456 is now Returned",
    );
    expect(returned.text).toContain(
      "Your return has been received. We'll check the sunglasses and let you know about your exchange or refund.",
    );
    // The apostrophe is HTML-escaped in the html body.
    expect(returned.html).toContain("Your return has been received.");
    expect(returned.html).toContain(
      "let you know about your exchange or refund.",
    );

    const refunded = buildOrderStatusEmail(
      STATUS_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
      "refunded",
    );
    expect(refunded.subject).toBe(
      "Your RabbY order RB-2026-123456 is now Refunded",
    );
    expect(refunded.text).toContain(
      "Your refund has been processed. We'll be in touch about how it reaches you.",
    );
    expect(refunded.html).toContain("Your refund has been processed.");
    // No refund timing / method promise anywhere in either body.
    for (const body of [refunded.text, refunded.html]) {
      expect(body).not.toMatch(/within \d+ days/i);
      expect(body).not.toContain("back to your bKash");
    }
  });

  it("renders the admin note for cancelled, returned, and refunded — never for other statuses", () => {
    const cancelled = buildOrderStatusEmail(
      STATUS_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
      "cancelled",
      "Customer asked to cancel",
    );
    expect(cancelled.text).toContain("Reason: Customer asked to cancel");
    expect(cancelled.html).toContain("Reason: Customer asked to cancel");

    const returned = buildOrderStatusEmail(
      STATUS_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
      "returned",
      "Refund sent to your bKash",
    );
    expect(returned.text).toContain("Note: Refund sent to your bKash");
    expect(returned.html).toContain("Note: Refund sent to your bKash");

    const refunded = buildOrderStatusEmail(
      STATUS_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
      "refunded",
      "Refund sent to your bKash",
    );
    expect(refunded.text).toContain("Note: Refund sent to your bKash");
    expect(refunded.html).toContain("Note: Refund sent to your bKash");

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
    for (const status of ["placed", "failed"]) {
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

  it("sends for returned and refunded moves and logs each attempt", async () => {
    withGmailConfigured();
    for (const [status, previousStatus] of [
      ["returned", "delivered"],
      ["refunded", "returned"],
    ] as const) {
      const result = await sendOrderStatusEmail({
        reference: "RB-2026-123456",
        status,
        previousStatus,
      });
      expect(result).toEqual({ status: "sent" });
    }
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    const subjects = sendMailMock.mock.calls.map(
      (call) => call[0].subject as string,
    );
    expect(subjects).toEqual([
      "Your RabbY order RB-2026-123456 is now Returned",
      "Your RabbY order RB-2026-123456 is now Refunded",
    ]);
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "returned", result: "sent" }),
    );
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "refunded", result: "sent" }),
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

// ---------------------------------------------------------------------------
// Back-in-stock alerts (S-7; no documented scope, owner-approved
// standard setup)
// ---------------------------------------------------------------------------

const BACK_IN_STOCK_TOKEN = "00000000-0000-0000-0000-000000000000";
const BACK_IN_STOCK_PRODUCT = {
  name: "SAMPLE Futuristic A",
  slug: "sample-futuristic",
};

describe("buildBackInStockEmail", () => {
  it("builds the subject with the product name", () => {
    const email = buildBackInStockEmail(
      BACK_IN_STOCK_PRODUCT,
      CUSTOMER_EMAIL,
      SENDER,
      BACK_IN_STOCK_TOKEN,
    );
    expect(email.subject).toBe(
      "Good news — SAMPLE Futuristic A is back in stock",
    );
    expect(email.from).toBe(`RabbY <${SENDER}>`);
    expect(email.to).toBe(CUSTOMER_EMAIL);
  });

  it("links the product page and states first-come-first-served", () => {
    const email = buildBackInStockEmail(
      BACK_IN_STOCK_PRODUCT,
      CUSTOMER_EMAIL,
      SENDER,
      BACK_IN_STOCK_TOKEN,
    );
    expect(email.text).toContain(
      "https://rabby-ecommerce-uhrm.vercel.app/product/sample-futuristic",
    );
    expect(email.text).toContain(
      "we can't hold one for you, so if you want it, order soon.",
    );
    expect(email.html).toContain(
      "we can't hold one for you, so if you want it, order soon.",
    );
  });

  it("promises no price and no hold anywhere", () => {
    const email = buildBackInStockEmail(
      BACK_IN_STOCK_PRODUCT,
      CUSTOMER_EMAIL,
      SENDER,
      BACK_IN_STOCK_TOKEN,
    );
    // No Taka figure and no price word in either body — the PDP is
    // the source of truth for the live price.
    expect(email.text).not.toContain("৳");
    expect(email.html).not.toContain("৳");
    expect(email.text.toLowerCase()).not.toContain("price");
    expect(email.html.toLowerCase()).not.toContain("price");
  });

  it("carries the unsubscribe link in text and html", () => {
    const email = buildBackInStockEmail(
      BACK_IN_STOCK_PRODUCT,
      CUSTOMER_EMAIL,
      SENDER,
      BACK_IN_STOCK_TOKEN,
    );
    const unsubscribeUrl = `https://rabby-ecommerce-uhrm.vercel.app/api/stock-alerts/unsubscribe?token=${BACK_IN_STOCK_TOKEN}`;
    expect(email.text).toContain(unsubscribeUrl);
    expect(email.html).toContain(unsubscribeUrl);
    expect(email.text).toContain("you won't hear from us about it again");
  });
});

describe("sendBackInStockAlert", () => {
  function withGmailConfigured() {
    vi.stubEnv("GMAIL_USER", SENDER);
    vi.stubEnv("GMAIL_APP_PASSWORD", "mock-app-password");
  }

  it("sends via Gmail SMTP and logs the sent attempt as back_in_stock", async () => {
    withGmailConfigured();
    const result = await sendBackInStockAlert({
      productName: BACK_IN_STOCK_PRODUCT.name,
      productSlug: BACK_IN_STOCK_PRODUCT.slug,
      recipient: CUSTOMER_EMAIL,
      unsubscribeToken: BACK_IN_STOCK_TOKEN,
    });
    expect(result).toEqual({ status: "sent" });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0][0];
    expect(sent.to).toBe(CUSTOMER_EMAIL);
    expect(sent.subject).toBe(
      "Good news — SAMPLE Futuristic A is back in stock",
    );
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderReference: "sample-futuristic",
        type: "back_in_stock",
        status: "back_in_stock",
        recipient: CUSTOMER_EMAIL,
        result: "sent",
      }),
    );
  });

  it("skips silently when the env vars are missing (no send)", async () => {
    const result = await sendBackInStockAlert({
      productName: BACK_IN_STOCK_PRODUCT.name,
      productSlug: BACK_IN_STOCK_PRODUCT.slug,
      recipient: CUSTOMER_EMAIL,
      unsubscribeToken: BACK_IN_STOCK_TOKEN,
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "email not configured",
    });
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "back_in_stock",
        result: "skipped",
        error: "email not configured",
      }),
    );
  });

  it("returns failed (never throws) when Gmail rejects the send", async () => {
    withGmailConfigured();
    sendMailMock.mockRejectedValue(new Error("Invalid credentials"));
    const result = await sendBackInStockAlert({
      productName: BACK_IN_STOCK_PRODUCT.name,
      productSlug: BACK_IN_STOCK_PRODUCT.slug,
      recipient: CUSTOMER_EMAIL,
      unsubscribeToken: BACK_IN_STOCK_TOKEN,
    });
    expect(result).toEqual({ status: "failed", reason: "send failed" });
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ result: "failed", error: "send failed" }),
    );
  });
});

describe("sendBackInStockAlertsForProduct", () => {
  const PRODUCT_ID = "00000000-0000-0000-0000-000000000000";
  const PENDING = [
    {
      id: "sub-1",
      product_id: PRODUCT_ID,
      product_slug: "sample-futuristic",
      product_name: "SAMPLE Futuristic A",
      email: "first@example.com",
      status: "pending" as const,
      created_at: "2026-11-26T00:00:00.000Z",
      sent_at: null,
    },
    {
      id: "sub-2",
      product_id: PRODUCT_ID,
      product_slug: "sample-futuristic",
      product_name: "SAMPLE Futuristic A",
      email: "second@example.com",
      status: "pending" as const,
      created_at: "2026-11-26T00:00:00.000Z",
      sent_at: null,
    },
  ];

  function withGmailConfigured() {
    vi.stubEnv("GMAIL_USER", SENDER);
    vi.stubEnv("GMAIL_APP_PASSWORD", "mock-app-password");
  }

  function trigger() {
    return sendBackInStockAlertsForProduct({
      productId: PRODUCT_ID,
      productName: BACK_IN_STOCK_PRODUCT.name,
      productSlug: BACK_IN_STOCK_PRODUCT.slug,
    });
  }

  it("sends one email per claimed subscriber and reports the counts", async () => {
    withGmailConfigured();
    listAlertsMock.mockResolvedValue(PENDING);
    claimAlertsMock.mockResolvedValue(
      PENDING.map((row) => ({
        id: row.id,
        email: row.email,
        unsubscribeToken: BACK_IN_STOCK_TOKEN,
      })),
    );
    const result = await trigger();
    expect(result).toEqual({ sent: 2, failed: 0, skipped: 0 });
    expect(listAlertsMock).toHaveBeenCalledWith(PRODUCT_ID, "pending");
    expect(claimAlertsMock).toHaveBeenCalledWith(PRODUCT_ID, [
      "sub-1",
      "sub-2",
    ]);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    const recipients = sendMailMock.mock.calls.map(
      (call) => call[0].to as string,
    );
    expect(recipients).toEqual(["first@example.com", "second@example.com"]);
  });

  it("does nothing when nobody is waiting", async () => {
    withGmailConfigured();
    const result = await trigger();
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(claimAlertsMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("does NOT claim rows when email is not configured — they stay pending", async () => {
    listAlertsMock.mockResolvedValue(PENDING);
    const result = await trigger();
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 2 });
    expect(claimAlertsMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    // One skipped log row per pending subscriber, so the admin can
    // see the gap instead of silently consuming the subscriptions.
    expect(logAttemptMock).toHaveBeenCalledTimes(2);
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "back_in_stock",
        result: "skipped",
        error: "email not configured",
      }),
    );
  });

  it("counts a failed send without failing the rest (never throws)", async () => {
    withGmailConfigured();
    listAlertsMock.mockResolvedValue(PENDING);
    claimAlertsMock.mockResolvedValue(
      PENDING.map((row) => ({
        id: row.id,
        email: row.email,
        unsubscribeToken: BACK_IN_STOCK_TOKEN,
      })),
    );
    sendMailMock
      .mockResolvedValueOnce({ messageId: "mock-1" })
      .mockRejectedValueOnce(new Error("Invalid credentials"));
    const result = await trigger();
    expect(result).toEqual({ sent: 1, failed: 1, skipped: 0 });
  });

  it("returns zeros (never throws) when the list call fails", async () => {
    withGmailConfigured();
    listAlertsMock.mockRejectedValue(new Error("Admin request failed"));
    const result = await trigger();
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Payment-failed email (S-7)
// ---------------------------------------------------------------------------

describe("buildPaymentFailedEmail", () => {
  it("has the approved subject, meaning line, items, total, track and contact links", () => {
    const email = buildPaymentFailedEmail(
      PAYMENT_FAILED_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
    );
    expect(email.from).toBe(`RabbY <${SENDER}>`);
    expect(email.to).toBe(CUSTOMER_EMAIL);
    expect(email.subject).toBe(
      "Your RabbY order RB-2026-123456 — we couldn't verify your payment",
    );
    expect(email.text).toContain(
      "We checked the payment for your order and could not verify it. Your order has not been cancelled — only the payment needs sorting out.",
    );
    // The apostrophe is HTML-escaped in the html body.
    expect(email.html).toContain("couldn&#39;t verify your payment.");
    expect(email.html).toContain("has not been cancelled");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("RB-2026-123456");
      expect(body).toContain("SAMPLE Aviator A");
      expect(body).toContain("Gold");
      expect(body).toContain("৳1,450");
      expect(body).toContain("৳1,583");
      expect(body).toContain(
        "https://rabby-ecommerce-uhrm.vercel.app/orders?ref=RB-2026-123456",
      );
      expect(body).toContain("https://rabby-ecommerce-uhrm.vercel.app/contact");
    }
    // No re-pay promise (no re-pay flow exists) and no WhatsApp
    // number (none has been provided).
    for (const body of [email.text, email.html]) {
      expect(body).not.toMatch(/pay again/i);
      expect(body).not.toContain("WhatsApp");
    }
  });

  it("shows the Transaction ID for mobile banking, never the sender number", () => {
    const email = buildPaymentFailedEmail(
      PAYMENT_FAILED_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
    );
    expect(email.text).toContain("Transaction ID: TRX12345678");
    expect(email.html).toContain("Transaction ID: TRX12345678");
    // The builder takes no sender number at all, so none can leak.
    expect(email.text).not.toContain("01799999999");
    expect(email.html).not.toContain("01799999999");
  });

  it("shows no Transaction ID line for COD or for mobile banking without one", () => {
    const cod = buildPaymentFailedEmail(
      { ...STATUS_ORDER, paymentMethod: "cod", paymentReference: null },
      CUSTOMER_EMAIL,
      SENDER,
    );
    expect(cod.text).not.toContain("Transaction ID");
    expect(cod.html).not.toContain("Transaction ID");

    const noReference = buildPaymentFailedEmail(
      { ...STATUS_ORDER, paymentMethod: "bkash", paymentReference: null },
      CUSTOMER_EMAIL,
      SENDER,
    );
    expect(noReference.text).not.toContain("Transaction ID");
    expect(noReference.html).not.toContain("Transaction ID");
  });

  it("renders the admin note verbatim, and nothing when there is no note", () => {
    const withNote = buildPaymentFailedEmail(
      PAYMENT_FAILED_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
      "Transaction ID not found",
    );
    expect(withNote.text).toContain("Note: Transaction ID not found");
    expect(withNote.html).toContain("Note: Transaction ID not found");

    const withoutNote = buildPaymentFailedEmail(
      PAYMENT_FAILED_ORDER,
      CUSTOMER_EMAIL,
      SENDER,
    );
    expect(withoutNote.text).not.toContain("Note:");
    expect(withoutNote.html).not.toContain("Note:");
  });

  it("escapes HTML in item names and the admin note", () => {
    const evilOrder: PaymentFailedEmailOrder = {
      ...PAYMENT_FAILED_ORDER,
      items: [
        {
          productName: "<script>alert(1)</script>",
          variantColour: null,
          quantity: 1,
          lineTotalBdt: 100,
        },
      ],
    };
    const email = buildPaymentFailedEmail(
      evilOrder,
      CUSTOMER_EMAIL,
      SENDER,
      "<b>evil note</b>",
    );
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).not.toContain("<b>evil note</b>");
    expect(email.html).toContain("&lt;b&gt;evil note&lt;/b&gt;");
  });
});

describe("sendPaymentFailedEmail", () => {
  function withGmailConfigured() {
    vi.stubEnv("GMAIL_USER", SENDER);
    vi.stubEnv("GMAIL_APP_PASSWORD", "mock-app-password");
  }

  it("sends via Gmail SMTP and logs the sent attempt as payment_failed", async () => {
    withGmailConfigured();
    const result = await sendPaymentFailedEmail({
      reference: "RB-2026-123456",
    });
    expect(result).toEqual({ status: "sent" });
    expect(adminGetOrderMock).toHaveBeenCalledWith("RB-2026-123456");
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0][0];
    expect(sent.from).toBe(`RabbY <${SENDER}>`);
    expect(sent.to).toBe(CUSTOMER_EMAIL);
    expect(sent.subject).toBe(
      "Your RabbY order RB-2026-123456 — we couldn't verify your payment",
    );
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderReference: "RB-2026-123456",
        type: "payment_failed",
        status: "payment_failed",
        recipient: CUSTOMER_EMAIL,
        result: "sent",
      }),
    );
  });

  it("sends the admin note and the Transaction ID when the order has them", async () => {
    withGmailConfigured();
    adminGetOrderMock.mockResolvedValue({
      ...ADMIN_ORDER_FIXTURE,
      order: {
        ...ADMIN_ORDER_FIXTURE.order,
        payment_method: "bkash",
        payment_reference: "TRX12345678",
      },
    });
    const result = await sendPaymentFailedEmail({
      reference: "RB-2026-123456",
      note: "Transaction ID not found",
    });
    expect(result).toEqual({ status: "sent" });
    const sent = sendMailMock.mock.calls[0][0];
    expect(sent.text).toContain("Transaction ID: TRX12345678");
    expect(sent.text).toContain("Note: Transaction ID not found");
  });

  it("skips silently when the env vars are missing (no fetch, no send)", async () => {
    const result = await sendPaymentFailedEmail({
      reference: "RB-2026-123456",
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "email not configured",
    });
    expect(adminGetOrderMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_failed",
        status: "payment_failed",
        result: "skipped",
        error: "email not configured",
      }),
    );
  });

  it("skips without sending when the order is already Cancelled", async () => {
    withGmailConfigured();
    adminGetOrderMock.mockResolvedValue({
      ...ADMIN_ORDER_FIXTURE,
      order: { ...ADMIN_ORDER_FIXTURE.order, status: "cancelled" },
    });
    const result = await sendPaymentFailedEmail({
      reference: "RB-2026-123456",
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "order cancelled",
    });
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_failed",
        status: "payment_failed",
        result: "skipped",
        error: "order cancelled",
      }),
    );
  });

  it("returns failed (never throws) when the order is not found", async () => {
    withGmailConfigured();
    adminGetOrderMock.mockResolvedValue(null);
    const result = await sendPaymentFailedEmail({
      reference: "RB-2026-000000",
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
    const result = await sendPaymentFailedEmail({
      reference: "RB-2026-123456",
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
    const result = await sendPaymentFailedEmail({
      reference: "RB-2026-123456",
    });
    expect(result).toEqual({ status: "failed", reason: "send failed" });
    expect(logAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ result: "failed", error: "send failed" }),
    );
  });

  it("returns failed (never throws) when the admin order fetch throws", async () => {
    withGmailConfigured();
    adminGetOrderMock.mockRejectedValue(new Error("Admin request failed"));
    const result = await sendPaymentFailedEmail({
      reference: "RB-2026-123456",
    });
    expect(result).toEqual({ status: "failed", reason: "send failed" });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("still reports sent when the log write itself fails", async () => {
    withGmailConfigured();
    logAttemptMock.mockRejectedValue(new Error("log write failed"));
    const result = await sendPaymentFailedEmail({
      reference: "RB-2026-123456",
    });
    expect(result).toEqual({ status: "sent" });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});
