import nodemailer from "nodemailer";
import { DELIVERY_OPTIONS, PAYMENT_METHODS } from "@/lib/demo-config";
import { formatPriceBdt } from "@/lib/format";
import { SITE_URL } from "@/lib/seo";
import {
  isMobileBankingMethod,
  lookupOrder,
  paymentStatusLabel,
  type OrderDetail,
} from "@/lib/supabase/orders";

/**
 * Order confirmation email (S-6, Launch Decision 4) — ONE email only.
 *
 * Sent once, after POST /api/checkout creates a guest order, from the
 * owner's dedicated Gmail account via Gmail SMTP (nodemailer, service
 * "gmail"). Sender address + app password come from server-only env
 * vars (GMAIL_USER / GMAIL_APP_PASSWORD) — never hardcoded, never
 * NEXT_PUBLIC_, never in code/tests/logs. When the owner buys a domain
 * and switches to a business email, only the env vars change.
 *
 * Guarantees:
 * - Email failure NEVER fails the order: sendOrderConfirmationEmail
 *   never throws (every failure is caught, logged server-side, and
 *   returned as { status: "failed" }); the checkout route wraps the
 *   call in try/catch as well.
 * - Missing env vars = skip silently: no crash, no throw at import or
 *   build time. The transport is created lazily inside the send
 *   function, never at module top level.
 * - The customer never waits on SMTP: the send is awaited with a
 *   short timeout (EMAIL_SEND_TIMEOUT_MS) so a hung SMTP connection
 *   cannot stall the checkout response.
 *
 * No other emails live here: no status-change, admin, or marketing
 * email. Those are future work, only if the owner asks.
 */

/** Hard cap on waiting for Gmail SMTP inside a checkout request. */
export const EMAIL_SEND_TIMEOUT_MS = 10_000;

export type EmailSendStatus = "sent" | "skipped" | "failed";

export interface EmailSendResult {
  status: EmailSendStatus;
  /** Plain-words reason for skipped/failed — never contains secrets. */
  reason?: string;
}

export interface OrderConfirmationEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

function paymentLabel(paymentMethod: string): string {
  return (
    PAYMENT_METHODS.find((method) => method.id === paymentMethod)?.label ??
    paymentMethod
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Pure builder: order confirmation email for one order. The sender
 * address is a parameter (read from GMAIL_USER by the send function),
 * never hardcoded here.
 */
export function buildOrderConfirmationEmail(
  order: OrderDetail,
  customerEmail: string,
  fromAddress: string,
): OrderConfirmationEmail {
  const trackUrl = `${SITE_URL}/orders?ref=${order.reference}`;
  const delivery = DELIVERY_OPTIONS[order.deliveryZone];
  const subject = `Your RabbY order ${order.reference} is confirmed`;

  const itemLines = order.items
    .map(
      (item) =>
        `- ${item.productName}${item.variantColour ? ` — ${item.variantColour}` : ""} × ${item.quantity} — ${formatPriceBdt(item.lineTotalBdt)}`,
    )
    .join("\n");

  const text = [
    `Hi ${order.customerName},`,
    ``,
    `Thank you for your order with RabbY. Your order ${order.reference} is confirmed.`,
    ``,
    `Items:`,
    itemLines,
    ``,
    `Subtotal: ${formatPriceBdt(order.subtotalBdt)}`,
    `Tax: ${formatPriceBdt(order.taxBdt)}`,
    `Delivery fee: ${formatPriceBdt(order.deliveryFeeBdt)}`,
    `Total: ${formatPriceBdt(order.totalBdt)}`,
    ``,
    `Payment method: ${paymentLabel(order.paymentMethod)}`,
    `Payment status: ${paymentStatusLabel(order.paymentStatus, order.paymentMethod)}`,
    ...(isMobileBankingMethod(order.paymentMethod) && order.paymentReference
      ? [`Transaction ID: ${order.paymentReference}`]
      : []),
    `Delivery: ${delivery.label} — ${delivery.estimate}`,
    ``,
    `Track your order: ${trackUrl}`,
    ``,
    `Thank you for shopping with RabbY.`,
  ].join("\n");

  const itemRows = order.items
    .map(
      (item) =>
        `<tr><td style="padding:6px 0;">${escapeHtml(item.productName)}${item.variantColour ? ` — ${escapeHtml(item.variantColour)}` : ""} × ${item.quantity}</td><td style="padding:6px 0;text-align:right;">${formatPriceBdt(item.lineTotalBdt)}</td></tr>`,
    )
    .join("");

  const html = [
    `<p>Hi ${escapeHtml(order.customerName)},</p>`,
    `<p>Thank you for your order with RabbY. Your order <strong>${escapeHtml(order.reference)}</strong> is confirmed.</p>`,
    `<table style="width:100%;border-collapse:collapse;">${itemRows}</table>`,
    `<p>Subtotal: ${formatPriceBdt(order.subtotalBdt)}<br>Tax: ${formatPriceBdt(order.taxBdt)}<br>Delivery fee: ${formatPriceBdt(order.deliveryFeeBdt)}<br><strong>Total: ${formatPriceBdt(order.totalBdt)}</strong></p>`,
    `<p>Payment method: ${escapeHtml(paymentLabel(order.paymentMethod))}<br>Payment status: ${escapeHtml(paymentStatusLabel(order.paymentStatus, order.paymentMethod))}${isMobileBankingMethod(order.paymentMethod) && order.paymentReference ? `<br>Transaction ID: ${escapeHtml(order.paymentReference)}` : ""}<br>Delivery: ${escapeHtml(delivery.label)} — ${escapeHtml(delivery.estimate)}</p>`,
    `<p><a href="${trackUrl}">Track your order</a></p>`,
    `<p>Thank you for shopping with RabbY.</p>`,
  ].join("\n");

  return {
    from: `RabbY <${fromAddress}>`,
    to: customerEmail,
    subject,
    text,
    html,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Email send timed out.")),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

/**
 * Send the order confirmation email for a just-created order.
 * NEVER throws: every failure path returns { status: "failed" } (or
 * "skipped" when email is not configured) after logging server-side.
 * The log carries only the reference + a plain-words reason — never
 * the customer email, never any secret.
 */
export async function sendOrderConfirmationEmail(input: {
  reference: string;
  phone: string;
  customerEmail: string;
}): Promise<EmailSendResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    // Email not configured (local dev, CI, or env vars not set yet):
    // skip silently. The order itself is unaffected.
    return { status: "skipped", reason: "email not configured" };
  }

  try {
    const order = await lookupOrder(input.reference, input.phone);
    if (!order) {
      console.error(
        "[order-email] confirmation email skipped: order not found",
        input.reference,
      );
      return { status: "failed", reason: "order not found" };
    }

    const email = buildOrderConfirmationEmail(order, input.customerEmail, user);
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
      connectionTimeout: 8000,
      socketTimeout: 8000,
    });
    await withTimeout(
      transporter.sendMail({
        from: email.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      EMAIL_SEND_TIMEOUT_MS,
    );
    return { status: "sent" };
  } catch (error) {
    console.error(
      "[order-email] confirmation email failed",
      input.reference,
      error instanceof Error ? error.message : "unknown error",
    );
    return { status: "failed", reason: "send failed" };
  }
}
