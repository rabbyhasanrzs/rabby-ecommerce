import { bagValidateRequestSchema } from "@/lib/api-schemas";
import {
  SupabaseNotConfiguredError,
  validateBagItems,
} from "@/lib/supabase/orders";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * POST /api/bag/validate — re-validate bag lines against live catalogue
 * data (price / stock). The bag page calls this before checkout so a
 * stale price or sold-out item is caught before the order is placed.
 *
 * 200 { ok, items, issues } — ok is false when any issue was found.
 * 400 invalid JSON or schema failure. 503 Supabase not configured.
 * 500 anything else (never leaks a stack trace).
 */
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

  const parsed = bagValidateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request.",
      },
      { status: 400 },
    );
  }

  try {
    const { items, issues } = await validateBagItems(parsed.data.items);
    return Response.json({ ok: issues.length === 0, items, issues });
  } catch (error) {
    if (error instanceof SupabaseNotConfiguredError) {
      return Response.json(
        {
          ok: false,
          error: "Service temporarily unavailable. Please try again.",
        },
        { status: 503 },
      );
    }
    return Response.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
}
