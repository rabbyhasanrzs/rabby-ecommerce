import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, connection } from "next/server";

/**
 * GET /api/health — public liveness + database check (S-6 monitoring).
 *
 * No auth: UptimeRobot polls this from outside. One cheap read of
 * the public site_settings row (the same anon-readable table the
 * public /api/settings route uses) proves the database answers.
 * 200 { status: "ok", db: "ok" } when it does; 503
 * { status: "degraded", db: "error" } when it does not — including
 * when Supabase is not configured at all. Never cached (no-store),
 * and the body carries no secrets, no timings, nothing that leaks
 * internals. With Cache Components on, `connection()` is the
 * replacement for `export const dynamic = "force-dynamic"`: this
 * runs at request time, never at build time.
 */
export async function GET() {
  // Prerendering stops here: the check below runs only at request time.
  await connection();
  try {
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from("site_settings")
      .select("id")
      .limit(1);
    if (error) {
      return degraded();
    }
    return NextResponse.json(
      { status: "ok", db: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return degraded();
  }
}

function degraded() {
  return NextResponse.json(
    { status: "degraded", db: "error" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
