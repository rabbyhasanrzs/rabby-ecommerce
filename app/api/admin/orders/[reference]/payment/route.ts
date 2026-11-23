import {
  adminClient,
  adminUpdatePaymentStatus,
  paymentStatusUpdateSchema,
} from "@/app/admin/(protected)/admin-data";
import {
  checkAdminAccess,
  getSupabaseAdminEnv,
} from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[reference]/payment — mark a pending
 * payment paid or failed (S-4, T-46).
 *
 * Auth failures are answered with JSON, never a redirect (same as
 * the inventory route, PR #26): this route is called with fetch(),
 * and a redirect would come back as the login page's HTML. Only a
 * pending payment can move; anything else is an invalid transition
 * (422) from the RPC.
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
      route: "POST /api/admin/orders/[reference]/payment",
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
  const parsed = paymentStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Check the payment status.",
      },
      { status: 400 },
    );
  }

  const result = await adminUpdatePaymentStatus(
    reference,
    parsed.data.status,
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
          error: "Only a pending payment can be marked paid or failed.",
        },
        { status: 422 },
      );
    }
    if (result.error === "invalid_status") {
      return Response.json(
        { ok: false, error: "That payment status is not valid." },
        { status: 400 },
      );
    }
    return Response.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, reference, status: parsed.data.status });
}
