import { bagValidateRequestSchema } from "@/lib/api-schemas";
import {
  BAG_RATE_LIMIT,
  BAG_RATE_WINDOW_MS,
  checkRateLimit,
  getClientKey,
} from "@/lib/rate-limit";
import {
  SupabaseNotConfiguredError,
  validateBagItems,
} from "@/lib/supabase/orders";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";

/**
 * POST /api/bag/validate — re-validate bag lines against live catalogue
 * data (price / stock). The bag page calls this before checkout so a
 * stale price or sold-out item is caught before the order is placed.
 *
 * 200 { ok, items, issues } — ok is false when any issue was found.
 * 400 invalid JSON or schema failure. 429 too many validation
 * attempts from this IP (30 / minute). 503 Supabase not configured.
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

  // S-6 (T-61, S6-03): bounded so the route cannot be hammered.
  // Checked AFTER the schema parse, so malformed requests never
  // consume budget.
  const bagLimit = checkRateLimit(
    `bag-validate:ip:${getClientKey(request)}`,
    BAG_RATE_LIMIT,
    BAG_RATE_WINDOW_MS,
  );
  if (!bagLimit.allowed) {
    return Response.json(
      { ok: false, error: RATE_LIMIT_ERROR },
      {
        status: 429,
        headers: { "Retry-After": String(bagLimit.retryAfterSeconds) },
      },
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
