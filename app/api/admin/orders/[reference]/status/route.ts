import {
  adminUpdateOrderStatus,
  orderStatusUpdateSchema,
  requireAdmin,
} from "@/app/admin/(protected)/admin-data";

/**
 * POST /api/admin/orders/[reference]/status — update an order's
 * status (S-4, T-46). requireAdmin() first. The RPC writes the new
 * status + a row in order_status_events, so the customer timeline
 * (which reads those events) shows the change. On Cancel the note
 * is the cancel reason and is required.
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
  return Response.json({ ok: true, reference, status: parsed.data.status });
}
