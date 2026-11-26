import nodemailer from "nodemailer";
import {
  adminClaimStockAlerts,
  adminGetOrder,
  adminListStockAlertSubscriptions,
  logNotificationAttempt,
} from "@/app/admin/(protected)/admin-data";
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
 * No other emails live here: no admin or marketing email.
 * Back-in-stock alerts and the payment-failed email live here
 * too — see the sections at the bottom.
 *
 * Order status emails (S-7, 1.x-4, F18) live here too — see
 * ORDER_STATUS_EMAIL_TRIGGERS below. One short email per admin
 * status move (Confirmed -> Delivered, plus Cancelled, Returned,
 * Refunded), sent automatically from POST /api/admin/orders/
 * [reference]/status. Placed is excluded — the confirmation email
 * above already covers it. Failed never sends — no live path sets
 * the order status (see the S-7 returned-emails investigation
 * note). Every attempt is written to notification_log
 * (migration 0012) via the admin-only log_notification function —
 * the recipient email lives in that admin-only table, never in
 * console / Vercel logs.
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
  // S-7: discount, only when a coupon was applied to this order.
  const discountBdt = order.discountBdt ?? 0;
  const discountCode = order.discountCode ?? null;
  const discountTextLine =
    discountBdt > 0
      ? `Discount${discountCode ? ` (${discountCode})` : ""}: −${formatPriceBdt(discountBdt)}`
      : null;

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
    ...(discountTextLine ? [discountTextLine] : []),
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
    `<p>Subtotal: ${formatPriceBdt(order.subtotalBdt)}${discountTextLine ? `<br>${escapeHtml(discountTextLine)}` : ""}<br>Tax: ${formatPriceBdt(order.taxBdt)}<br>Delivery fee: ${formatPriceBdt(order.deliveryFeeBdt)}<br><strong>Total: ${formatPriceBdt(order.totalBdt)}</strong></p>`,
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

// ---------------------------------------------------------------------------
// Order status emails (S-7, 1.x-4, F18 — the status-updates half)
// ---------------------------------------------------------------------------

/**
 * Statuses that trigger a status email. All forward steps from
 * Confirmed to Delivered, plus Cancelled, Returned, and Refunded.
 * Placed is excluded — the order-confirmation email already covers
 * it, so the customer is never emailed twice for one event. Failed
 * is excluded too — no live path sets the order status, so it can
 * never fire (see the S-7 returned-emails investigation note).
 *
 * Free movement (PR #21) means one email per move, never a burst
 * for skipped steps: the admin jumps Placed -> Delivered directly,
 * the customer gets one email for Delivered.
 */
export const ORDER_STATUS_EMAIL_TRIGGERS = [
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
] as const;

export function isOrderStatusEmailTrigger(status: string): boolean {
  return (ORDER_STATUS_EMAIL_TRIGGERS as readonly string[]).includes(status);
}

/** Plain-words label per trigger status — same words as the track-order timeline. */
const ORDER_STATUS_EMAIL_LABELS: Record<string, string> = {
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

/** One plain-words line saying what the new status means. */
const ORDER_STATUS_EMAIL_LINES: Record<string, string> = {
  confirmed: "We've confirmed your order and we're getting it ready.",
  processing: "We're preparing your order for packing.",
  packed: "Your order is packed and ready to ship.",
  shipped: "Your order is on its way to you.",
  out_for_delivery:
    "Your order is out for delivery and should reach you soon.",
  delivered:
    "Your order has been delivered. Thank you for shopping with RabbY.",
  cancelled: "Your order has been cancelled.",
  // S-7 returned emails: "Returned" means the item is back at the
  // shop (owner assumption — see the PR body). The Refunded line
  // stays vague on purpose: refund timing / method / who pays
  // return shipping are unsettled, so the email promises none of
  // them; the per-order facts travel in the admin's note instead.
  returned:
    "Your return has been received. We'll check the sunglasses and let you know about your exchange or refund.",
  refunded:
    "Your refund has been processed. We'll be in touch about how it reaches you.",
};

/** Label for the admin note in the email, per note-bearing status. */
const NOTE_LABELS: Record<string, string> = {
  cancelled: "Reason",
  returned: "Note",
  refunded: "Note",
};

/**
 * What the status builder needs — only what the email renders
 * (items + total), mapped from the admin order detail by the send
 * function. No payment details, no address, no sender number.
 */
export interface OrderStatusEmailOrder {
  reference: string;
  customerName: string;
  items: Array<{
    productName: string;
    variantColour: string | null;
    quantity: number;
    lineTotalBdt: number;
  }>;
  totalBdt: number;
}

/**
 * Pure builder: order status email for one order. Same shape as
 * buildOrderConfirmationEmail (subject / text / html, no secrets).
 * The `note` is the admin's note — rendered for cancelled (as the
 * cancel reason), returned, and refunded, where it is the only
 * place the per-order facts live; never for other statuses. The
 * note goes to the customer verbatim, so the admin form labels it
 * customer-visible.
 */
export function buildOrderStatusEmail(
  order: OrderStatusEmailOrder,
  customerEmail: string,
  fromAddress: string,
  status: string,
  note?: string | null,
): OrderConfirmationEmail {
  const label = ORDER_STATUS_EMAIL_LABELS[status] ?? status;
  const meaning = ORDER_STATUS_EMAIL_LINES[status] ?? "";
  const trackUrl = `${SITE_URL}/orders?ref=${order.reference}`;
  const subject = `Your RabbY order ${order.reference} is now ${label}`;
  // The note is customer-visible for the note-bearing statuses
  // only — every other status ignores it even when one is present.
  const noteLabel = NOTE_LABELS[status];
  const adminNote =
    noteLabel !== undefined && note && note.trim().length > 0
      ? note.trim()
      : null;

  const itemLines = order.items
    .map(
      (item) =>
        `- ${item.productName}${item.variantColour ? ` — ${item.variantColour}` : ""} × ${item.quantity} — ${formatPriceBdt(item.lineTotalBdt)}`,
    )
    .join("\n");

  const text = [
    `Hi ${order.customerName},`,
    ``,
    `Your order ${order.reference} is now ${label}.`,
    meaning,
    ...(adminNote && noteLabel ? [`${noteLabel}: ${adminNote}`] : []),
    ``,
    `Items:`,
    itemLines,
    ``,
    `Total: ${formatPriceBdt(order.totalBdt)}`,
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
    `<p>Your order <strong>${escapeHtml(order.reference)}</strong> is now <strong>${escapeHtml(label)}</strong>.</p>`,
    ...(meaning ? [`<p>${escapeHtml(meaning)}</p>`] : []),
    ...(adminNote && noteLabel
      ? [`<p>${escapeHtml(noteLabel)}: ${escapeHtml(adminNote)}</p>`]
      : []),
    `<table style="width:100%;border-collapse:collapse;">${itemRows}</table>`,
    `<p><strong>Total: ${formatPriceBdt(order.totalBdt)}</strong></p>`,
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

/**
 * Best-effort write to notification_log (migration 0012). Never
 * throws: a failed log write must never fail the status update or
 * turn a sent email into a failed one. The recipient email goes
 * into the admin-only table only — never into a console log.
 */
async function logStatusEmailAttempt(input: {
  reference: string;
  status: string;
  recipient: string | null;
  result: EmailSendStatus;
  reason?: string;
}): Promise<void> {
  try {
    await logNotificationAttempt({
      orderReference: input.reference,
      type: "order_status",
      status: input.status,
      recipient: input.recipient,
      result: input.result,
      error: input.result === "sent" ? null : (input.reason ?? null),
    });
  } catch {
    // Best-effort audit log — see above.
  }
}

/**
 * Send the order status email for one admin status move.
 * NEVER throws: every failure path returns { status: "failed" } (or
 * "skipped") after a server-side log carrying only the reference +
 * a plain-words reason — never the customer email, never a secret.
 * The caller (the status route) already committed the status change
 * before calling this, so a failed send never fails the update.
 *
 * The order is fetched with adminGetOrder — the guest lookup
 * deliberately hides the customer email (migration 0006), so only
 * the admin-side read has it.
 */
export async function sendOrderStatusEmail(input: {
  reference: string;
  status: string;
  /**
   * Status before the move. When it equals the new status the move
   * was a re-save, not a change, and no email goes out — the RPC
   * (admin_update_order_status, migration 0005) accepts same-status
   * re-saves, so without this the customer would get a duplicate
   * email for a no-op save. Null / missing means "unknown": the
   * email is sent once (the guard only skips what it can prove
   * did not change).
   */
  previousStatus?: string | null;
  /** The admin note — rendered in the email for cancelled, returned, and refunded (customer-visible); ignored for other statuses. */
  note?: string | null;
}): Promise<EmailSendResult> {
  // 1. Trigger allow-list — Placed / Failed never send. This is not
  //    a failure: nothing was attempted.
  if (!isOrderStatusEmailTrigger(input.status)) {
    return { status: "skipped", reason: "status does not trigger an email" };
  }

  // 2. Same-status re-save — no change, no email.
  if (
    input.previousStatus != null &&
    input.previousStatus === input.status
  ) {
    return { status: "skipped", reason: "status unchanged" };
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    // Email not configured (local dev, CI, or env vars not set yet):
    // skip silently. The status update itself is unaffected.
    await logStatusEmailAttempt({
      reference: input.reference,
      status: input.status,
      recipient: null,
      result: "skipped",
      reason: "email not configured",
    });
    return { status: "skipped", reason: "email not configured" };
  }

  let recipient: string | null = null;
  try {
    const adminOrder = await adminGetOrder(input.reference);
    if (!adminOrder) {
      console.error(
        "[order-email] status email skipped: order not found",
        input.reference,
      );
      await logStatusEmailAttempt({
        reference: input.reference,
        status: input.status,
        recipient: null,
        result: "failed",
        reason: "order not found",
      });
      return { status: "failed", reason: "order not found" };
    }

    recipient = adminOrder.order.customer_email;
    if (!recipient) {
      console.error(
        "[order-email] status email skipped: no customer email",
        input.reference,
      );
      await logStatusEmailAttempt({
        reference: input.reference,
        status: input.status,
        recipient: null,
        result: "failed",
        reason: "no customer email",
      });
      return { status: "failed", reason: "no customer email" };
    }

    const email = buildOrderStatusEmail(
      {
        reference: adminOrder.order.reference,
        customerName: adminOrder.order.customer_name,
        items: adminOrder.items.map((item) => ({
          productName: item.name,
          variantColour: item.variant_colour,
          quantity: item.quantity,
          lineTotalBdt: item.price_bdt * item.quantity,
        })),
        totalBdt: adminOrder.order.total_bdt,
      },
      recipient,
      user,
      input.status,
      input.note ?? null,
    );
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
    await logStatusEmailAttempt({
      reference: input.reference,
      status: input.status,
      recipient,
      result: "sent",
    });
    return { status: "sent" };
  } catch (error) {
    console.error(
      "[order-email] status email failed",
      input.reference,
      error instanceof Error ? error.message : "unknown error",
    );
    await logStatusEmailAttempt({
      reference: input.reference,
      status: input.status,
      recipient,
      result: "failed",
      reason: "send failed",
    });
    return { status: "failed", reason: "send failed" };
  }
}

// ---------------------------------------------------------------------------
// Back-in-stock alerts (S-7 — no documented scope; owner-approved
// standard setup, see the S-7 back-in-stock investigation note)
// ---------------------------------------------------------------------------

/**
 * Pure builder: back-in-stock alert for one subscriber. Same shape
 * as the order emails (subject / text / html, no secrets), but with
 * two deliberate differences: NO price (it can change between the
 * alert and the click — the PDP is the source of truth), and an
 * unsubscribe link in text AND html (required here, unlike the
 * order emails: this is an opt-in alert, not a transactional
 * order email — the link is what makes the consent revocable).
 * First-come-first-served is stated plainly: the shop has no hold
 * mechanism, so the email must never imply one.
 */
export function buildBackInStockEmail(
  product: { name: string; slug: string },
  recipient: string,
  fromAddress: string,
  unsubscribeToken: string,
): OrderConfirmationEmail {
  const productUrl = `${SITE_URL}/product/${product.slug}`;
  const unsubscribeUrl = `${SITE_URL}/api/stock-alerts/unsubscribe?token=${unsubscribeToken}`;
  const subject = `Good news — ${product.name} is back in stock`;

  const text = [
    `Hi,`,
    ``,
    `The ${product.name} you asked about is back in stock at RabbY. You can see it here: ${productUrl}`,
    ``,
    `Items sell in the order customers buy them — we can't hold one for you, so if you want it, order soon.`,
    ``,
    `You asked to be told when this was back in stock — you won't hear from us about it again. If you don't want these emails, unsubscribe here: ${unsubscribeUrl}`,
    ``,
    `Thank you for shopping with RabbY.`,
  ].join("\n");

  const html = [
    `<p>Hi,</p>`,
    `<p>The <strong>${escapeHtml(product.name)}</strong> you asked about is back in stock at RabbY. You can see it here: <a href="${productUrl}">${escapeHtml(productUrl)}</a></p>`,
    `<p>Items sell in the order customers buy them — we can't hold one for you, so if you want it, order soon.</p>`,
    `<p>You asked to be told when this was back in stock — you won't hear from us about it again. If you don't want these emails, <a href="${unsubscribeUrl}">unsubscribe here</a>.</p>`,
    `<p>Thank you for shopping with RabbY.</p>`,
  ].join("\n");

  return {
    from: `RabbY <${fromAddress}>`,
    to: recipient,
    subject,
    text,
    html,
  };
}

/**
 * Best-effort write to notification_log for a back-in-stock attempt
 * (migration 0013 extends the type CHECK with 'back_in_stock').
 * Same guarantees as logStatusEmailAttempt: never throws, recipient
 * in the admin-only table only. The order_reference slot holds the
 * product slug — there is no order here; the slug is what the admin
 * queries by.
 */
async function logBackInStockAttempt(input: {
  productSlug: string;
  recipient: string | null;
  result: EmailSendStatus;
  reason?: string;
}): Promise<void> {
  try {
    await logNotificationAttempt({
      orderReference: input.productSlug,
      type: "back_in_stock",
      status: "back_in_stock",
      recipient: input.recipient,
      result: input.result,
      error: input.result === "sent" ? null : (input.reason ?? null),
    });
  } catch {
    // Best-effort audit log — see above.
  }
}

/**
 * Send one back-in-stock alert. NEVER throws: every failure path
 * returns { status: "failed" } (or "skipped" when email is not
 * configured) after a server-side log carrying only the product
 * slug + a plain-words reason — never the subscriber email, never
 * a secret.
 */
export async function sendBackInStockAlert(input: {
  productName: string;
  productSlug: string;
  recipient: string;
  unsubscribeToken: string;
}): Promise<EmailSendResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    // Email not configured (local dev, CI, or env vars not set yet):
    // skip silently. The subscription itself is unaffected — the
    // trigger helper only claims rows when the send path is live.
    await logBackInStockAttempt({
      productSlug: input.productSlug,
      recipient: null,
      result: "skipped",
      reason: "email not configured",
    });
    return { status: "skipped", reason: "email not configured" };
  }

  try {
    const email = buildBackInStockEmail(
      { name: input.productName, slug: input.productSlug },
      input.recipient,
      user,
      input.unsubscribeToken,
    );
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
    await logBackInStockAttempt({
      productSlug: input.productSlug,
      recipient: input.recipient,
      result: "sent",
    });
    return { status: "sent" };
  } catch (error) {
    console.error(
      "[order-email] back-in-stock alert failed",
      input.productSlug,
      error instanceof Error ? error.message : "unknown error",
    );
    await logBackInStockAttempt({
      productSlug: input.productSlug,
      recipient: input.recipient,
      result: "failed",
      reason: "send failed",
    });
    return { status: "failed", reason: "send failed" };
  }
}

/**
 * Send back-in-stock alerts for one restocked product (S-7).
 * Called by POST /api/admin/inventory after a 0 -> >0 crossing on
 * an active product. NEVER throws: a failed send never fails the
 * inventory save.
 *
 * Order of operations matters: when email is not configured, the
 * pending rows are NOT claimed — they stay pending, so a later
 * restock (after the env vars are set) still alerts them. Only
 * when the send path is live are the rows claimed (atomically, by
 * mark_stock_alerts_sent) before sending, so two quick saves can
 * never email the same person twice. A claimed row whose send
 * fails stays 'sent' — the failure is in notification_log, and
 * the customer can re-subscribe.
 */
export async function sendBackInStockAlertsForProduct(input: {
  productId: string;
  productName: string;
  productSlug: string;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const zero = { sent: 0, failed: 0, skipped: 0 };
  try {
    const pending = await adminListStockAlertSubscriptions(
      input.productId,
      "pending",
    );
    if (pending.length === 0) {
      return zero;
    }
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      // No email to send with — leave the rows pending and log one
      // skipped attempt each, so the admin can see the gap in the
      // log instead of silently consuming the subscriptions.
      for (const row of pending) {
        await logBackInStockAttempt({
          productSlug: input.productSlug,
          recipient: row.email,
          result: "skipped",
          reason: "email not configured",
        });
      }
      return { sent: 0, failed: 0, skipped: pending.length };
    }
    const claimed = await adminClaimStockAlerts(
      input.productId,
      pending.map((row) => row.id),
    );
    let sent = 0;
    let failed = 0;
    for (const row of claimed) {
      const result = await sendBackInStockAlert({
        productName: input.productName,
        productSlug: input.productSlug,
        recipient: row.email,
        unsubscribeToken: row.unsubscribeToken,
      });
      if (result.status === "sent") {
        sent += 1;
      } else {
        failed += 1;
      }
    }
    return { sent, failed, skipped: 0 };
  } catch (error) {
    console.error(
      "[order-email] back-in-stock alerts failed",
      input.productSlug,
      error instanceof Error ? error.message : "unknown error",
    );
    return zero;
  }
}
// ---------------------------------------------------------------------------
// Payment-failed email (S-7 — the payment-failure event)
// ---------------------------------------------------------------------------

/**
 * Payment-failed email — the "failed" customers actually experience.
 * The order status `failed` is unreachable (no live path sets it),
 * so this is NOT an order-status email: the admin marks a payment
 * failed by hand on POST /api/admin/orders/[reference]/payment
 * after checking the Transaction ID, and that marking is the only
 * trigger. Failed is TERMINAL — once marked failed a payment can
 * never be corrected to paid in the product (the RPC only moves a
 * pending payment), so the email points the customer to the
 * Contact page and the owner sorts it out by hand. There is no
 * re-pay flow on the site, so the email never tells the customer
 * to "pay again", and it never prints a WhatsApp number (none has
 * been provided). Every attempt is written to notification_log
 * (migration 0014) with type 'payment_failed'.
 */
export interface PaymentFailedEmailOrder extends OrderStatusEmailOrder {
  paymentMethod: string;
  paymentReference: string | null;
}

/**
 * Pure builder: payment-failed email for one order. Same shape as
 * buildOrderStatusEmail (subject / text / html, no secrets). The
 * `note` is the admin's note — rendered verbatim, so the admin
 * form labels it customer-visible. The sender number is never
 * rendered anywhere (S-6); the Transaction ID is shown for mobile
 * banking only, mirroring the confirmation email.
 */
export function buildPaymentFailedEmail(
  order: PaymentFailedEmailOrder,
  customerEmail: string,
  fromAddress: string,
  note?: string | null,
): OrderConfirmationEmail {
  const trackUrl = `${SITE_URL}/orders?ref=${order.reference}`;
  const contactUrl = `${SITE_URL}/contact`;
  const subject = `Your RabbY order ${order.reference} — we couldn't verify your payment`;
  const meaning =
    "We checked the payment for your order and could not verify it. Your order has not been cancelled — only the payment needs sorting out.";
  const adminNote =
    note && note.trim().length > 0 ? note.trim() : null;

  const itemLines = order.items
    .map(
      (item) =>
        `- ${item.productName}${item.variantColour ? ` — ${item.variantColour}` : ""} × ${item.quantity} — ${formatPriceBdt(item.lineTotalBdt)}`,
    )
    .join("\n");

  const text = [
    `Hi ${order.customerName},`,
    ``,
    `Your order ${order.reference} — we couldn't verify your payment.`,
    meaning,
    ...(isMobileBankingMethod(order.paymentMethod) && order.paymentReference
      ? [`Transaction ID: ${order.paymentReference}`]
      : []),
    ...(adminNote ? [`Note: ${adminNote}`] : []),
    ``,
    `Please contact us from the Contact page (${contactUrl}) with your order reference, and we'll sort it out with you.`,
    ``,
    `Items:`,
    itemLines,
    ``,
    `Total: ${formatPriceBdt(order.totalBdt)}`,
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
    `<p>Your order <strong>${escapeHtml(order.reference)}</strong> — ${escapeHtml("we couldn't verify your payment.")}</p>`,
    `<p>${escapeHtml(meaning)}</p>`,
    ...(isMobileBankingMethod(order.paymentMethod) && order.paymentReference
      ? [`<p>Transaction ID: ${escapeHtml(order.paymentReference)}</p>`]
      : []),
    ...(adminNote ? [`<p>Note: ${escapeHtml(adminNote)}</p>`] : []),
    `<p>Please contact us from the <a href="${contactUrl}">Contact page</a> with your order reference, and ${escapeHtml("we'll sort it out with you.")}</p>`,
    `<table style="width:100%;border-collapse:collapse;">${itemRows}</table>`,
    `<p><strong>Total: ${formatPriceBdt(order.totalBdt)}</strong></p>`,
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

/**
 * Best-effort write to notification_log (migration 0014) for a
 * payment-failed email attempt — same never-throws contract as
 * logStatusEmailAttempt above.
 */
async function logPaymentFailedEmailAttempt(input: {
  reference: string;
  recipient: string | null;
  result: EmailSendStatus;
  reason?: string;
}): Promise<void> {
  try {
    await logNotificationAttempt({
      orderReference: input.reference,
      type: "payment_failed",
      status: "payment_failed",
      recipient: input.recipient,
      result: input.result,
      error: input.result === "sent" ? null : (input.reason ?? null),
    });
  } catch {
    // Best-effort audit log — see above.
  }
}

/**
 * Send the payment-failed email for one admin payment marking.
 * NEVER throws: every failure path returns { status: "failed" } (or
 * "skipped") after a server-side log carrying only the reference +
 * a plain-words reason — never the customer email, never a secret.
 * The caller (the payment route) already committed the marking
 * before calling this, so a failed send never fails the update.
 *
 * Fires at most once per order by construction: the RPC
 * (admin_update_payment_status, migration 0005) only moves a
 * pending payment, so there is no re-save path and no duplicate
 * to guard against. A Cancelled order is skipped — the customer
 * already knows that order is cancelled. The order is fetched
 * with adminGetOrder — the guest lookup deliberately hides the
 * customer email (migration 0006), so only the admin-side read
 * has it.
 */
export async function sendPaymentFailedEmail(input: {
  reference: string;
  /** The admin note — rendered in the email verbatim (customer-visible). */
  note?: string | null;
}): Promise<EmailSendResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    // Email not configured (local dev, CI, or env vars not set yet):
    // skip silently. The payment update itself is unaffected.
    await logPaymentFailedEmailAttempt({
      reference: input.reference,
      recipient: null,
      result: "skipped",
      reason: "email not configured",
    });
    return { status: "skipped", reason: "email not configured" };
  }

  let recipient: string | null = null;
  try {
    const adminOrder = await adminGetOrder(input.reference);
    if (!adminOrder) {
      console.error(
        "[order-email] payment-failed email skipped: order not found",
        input.reference,
      );
      await logPaymentFailedEmailAttempt({
        reference: input.reference,
        recipient: null,
        result: "failed",
        reason: "order not found",
      });
      return { status: "failed", reason: "order not found" };
    }

    // Cancelled guard — the customer already knows the order is
    // cancelled; a payment-failed email for it would only confuse.
    // Delivered orders still get the email (the customer holds the
    // order and needs to know the payment could not be verified).
    if (adminOrder.order.status === "cancelled") {
      await logPaymentFailedEmailAttempt({
        reference: input.reference,
        recipient: null,
        result: "skipped",
        reason: "order cancelled",
      });
      return { status: "skipped", reason: "order cancelled" };
    }

    recipient = adminOrder.order.customer_email;
    if (!recipient) {
      console.error(
        "[order-email] payment-failed email skipped: no customer email",
        input.reference,
      );
      await logPaymentFailedEmailAttempt({
        reference: input.reference,
        recipient: null,
        result: "failed",
        reason: "no customer email",
      });
      return { status: "failed", reason: "no customer email" };
    }

    const email = buildPaymentFailedEmail(
      {
        reference: adminOrder.order.reference,
        customerName: adminOrder.order.customer_name,
        items: adminOrder.items.map((item) => ({
          productName: item.name,
          variantColour: item.variant_colour,
          quantity: item.quantity,
          lineTotalBdt: item.price_bdt * item.quantity,
        })),
        totalBdt: adminOrder.order.total_bdt,
        paymentMethod: adminOrder.order.payment_method,
        paymentReference: adminOrder.order.payment_reference,
      },
      recipient,
      user,
      input.note ?? null,
    );
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
    await logPaymentFailedEmailAttempt({
      reference: input.reference,
      recipient,
      result: "sent",
    });
    return { status: "sent" };
  } catch (error) {
    console.error(
      "[order-email] payment-failed email failed",
      input.reference,
      error instanceof Error ? error.message : "unknown error",
    );
    await logPaymentFailedEmailAttempt({
      reference: input.reference,
      recipient,
      result: "failed",
      reason: "send failed",
    });
    return { status: "failed", reason: "send failed" };
  }
}
