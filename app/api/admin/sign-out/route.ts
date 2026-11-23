import { adminClient } from "@/app/admin/(protected)/admin-data";
import {
  checkAdminAccess,
  getSupabaseAdminEnv,
} from "@/lib/supabase/admin";

/**
 * POST /api/admin/sign-out — end the admin's Supabase session and
 * return { ok: true }. Only a signed-in admin can call it — an auth
 * failure is answered with JSON, never a redirect (same as the
 * inventory route, PR #26): this route is called with fetch(), and
 * a redirect would come back as the login page's HTML. The client
 * then navigates to /admin/login.
 */
export async function POST() {
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
  const supabase = await adminClient();
  const access = await checkAdminAccess(supabase);
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
      route: "POST /api/admin/sign-out",
      code: access.status,
    });
    return Response.json(
      { ok: false, error, code: access.status },
      { status: 401 },
    );
  }
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
