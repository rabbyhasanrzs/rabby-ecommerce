import {
  adminClient,
  adminGetOrder,
  adminUpdateOrderStatus,
  orderStatusUpdateSchema,
} from "@/app/admin/(protected)/admin-data";
import { sendOrderStatusEmail } from "@/lib/order-email";
import {
  checkAdminAccess,
  getSupabaseAdminEnv,
} from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[reference]/status — update an order's
 * status (S-4, T-46).
 *
 * Auth failures are answered with JSON, never a redirect (same as
 * the inventory route, PR #26): this route is called with fetch(),
 * and a redirect would come back as the login page's HTML. The RPC
 * writes the new status + a row in order_status_events, so the
 * customer timeline (which reads those events) shows the change.
 * On Cancel the note is the cancel reason and is required.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  if (!getSupabaseAdminEnv()) {
    // No Supabase configured (e.g. a build with no env vars): nobody
    // can be signed in — the same answer as a logged-out visit.
    return Response.json(
      {
        ok: false,
        error: "Your session ended. Please sign in again.",
        code: "unauthenticated",
      },
      { status: 401 },
    );
  }
  const access = await checkAdminAccess(await adminClient());
  if (access.status !== "ok") {
    const error =
      access.status === "unauthenticated"
        ? "Your session ended. Please sign in again."
        : access.status === "forbidden"
          ? "This account is not an admin."
          : access.status === "mfa-missing"
            ? "Two-factor authentication is required. Please set it up first."
            : "Two-factor authentication is required. Please sign in again with your authenticator code.";
    // Log the failure server-side (route + code only, no user data);
    // the admin sees the plain-words message above.
    console.error("Admin API auth failed", {
      route: "POST /api/admin/orders/[reference]/status",
      code: access.status,
    });
    return Response.json(
      { ok: false, error, code: access.status },
      { status: 401 },
    );
  }
  const { reference } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = orderStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the new status.",
      },
      { status: 400 },
    );
  }
  if (parsed.data.status === "cancelled" && !parsed.data.note) {
    return Response.json(
      { ok: false, error: "Enter a cancel reason." },
      { status: 400 },
    );
  }

  // Best-effort: the status before the move. The RPC accepts a
  // same-status re-save (migration 0005, no guard), so without this
  // the customer would get a duplicate email for a no-op save. A
  // failed read never blocks the update — the send below then
  // simply cannot prove "unchanged" and sends once.
  let previousStatus: string | null = null;
  try {
    previousStatus = (await adminGetOrder(reference))?.order.status ?? null;
  } catch {
    // Best-effort only — see above.
  }

  const result = await adminUpdateOrderStatus(
    reference,
    parsed.data.status,
    parsed.data.note ?? null,
  );
  if (!result.ok) {
    if (result.error === "not_found") {
      return Response.json(
        { ok: false, error: "Order not found." },
        { status: 404 },
      );
    }
    if (result.error === "invalid_transition") {
      return Response.json(
        {
          ok: false,
          error: "That status change is not allowed from here.",
        },
        { status: 422 },
      );
    }
    if (result.error === "invalid_status") {
      return Response.json(
        { ok: false, error: "That status is not valid." },
        { status: 400 },
      );
    }
    return Response.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
  // Auto-send the status email (S-7, 1.x-4). The status change is
  // already committed; a failed or skipped send is logged in
  // notification_log (migration 0012) and the admin still gets
  // { ok: true } — the email must never fail the update.
  // sendOrderStatusEmail never throws by contract; the try/catch is
  // a belt under the braces.
  try {
    await sendOrderStatusEmail({
      reference,
      status: parsed.data.status,
      previousStatus,
      note: parsed.data.note ?? null,
    });
  } catch {
    // Never fail the status update on an email error.
  }
  return Response.json({ ok: true, reference, status: parsed.data.status });
}
