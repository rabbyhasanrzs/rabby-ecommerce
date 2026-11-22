import {
  adminUpdatePaymentStatus,
  paymentStatusUpdateSchema,
  requireAdmin,
} from "@/app/admin/(protected)/admin-data";

/**
 * POST /api/admin/orders/[reference]/payment — mark a pending
 * payment paid or failed (S-4, T-46). requireAdmin() first. Only a
 * pending payment can move; anything else is an invalid transition
 * (422) from the RPC.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  await requireAdmin();
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
