import { unsubscribeStockAlert } from "@/lib/stock-alerts";
import { z } from "zod";

const tokenSchema = z.string().uuid();

/**
 * GET /api/stock-alerts/unsubscribe?token=… — unsubscribe from a
 * back-in-stock alert (S-7; no documented scope, owner-approved
 * standard setup).
 *
 * The link in the alert email carries the per-row unsubscribe
 * token — the token IS the secret, no auth. Clicking it marks the
 * subscription 'unsubscribed' and shows a plain-words
 * confirmation page. One message for a valid and an invalid token
 * alike when the token parses: a bad token reveals nothing about
 * which tokens exist. A malformed token (not a uuid) gets the
 * "isn't valid" page instead.
 *
 * POST with { token } does the same and answers JSON — for clients
 * that prefer a form post over a link click.
 */
function confirmationPage(message: string): Response {
  const html = [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Stock alerts — RabbY</title></head>`,
    `<body style="margin:0;font-family:system-ui,sans-serif;background:#F7F4EF;color:#171717;">`,
    `<main style="max-width:560px;margin:0 auto;padding:48px 20px;">`,
    `<h1 style="font-size:24px;margin:0 0 12px;">Stock alerts</h1>`,
    `<p style="font-size:16px;line-height:1.6;margin:0 0 24px;">${message}</p>`,
    `<p style="font-size:16px;"><a href="/" style="color:#7A263A;font-weight:600;">Back to the store</a></p>`,
    `</main></body></html>`,
  ].join("\n");
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const UNSUBSCRIBED_MESSAGE =
  "You've been unsubscribed from stock alerts for this product. You won't hear from us about it again.";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokenSchema.safeParse(token).success) {
    return confirmationPage("This unsubscribe link isn't valid.");
  }
  try {
    await unsubscribeStockAlert(token);
    return confirmationPage(UNSUBSCRIBED_MESSAGE);
  } catch {
    return confirmationPage("Something went wrong. Please try again.");
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const parsed = z.object({ token: tokenSchema }).safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "This unsubscribe link isn't valid." },
      { status: 400 },
    );
  }
  try {
    await unsubscribeStockAlert(parsed.data.token);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
