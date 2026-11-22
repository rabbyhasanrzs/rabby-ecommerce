import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth callback (Supabase PKCE) — the recovery email links here
 * with ?code=...&next=/admin/reset-password. The code is exchanged
 * for a session in this Route Handler (cookies can be set here,
 * unlike in a Server Component), then the admin is sent to the
 * reset page. `next` must be a same-site path, so a crafted link
 * cannot bounce the admin elsewhere. A missing code or a failed
 * exchange lands on the reset page with ?error=invalid, which
 * shows the plain-words invalid-link message — and each failure is
 * also logged with console.error (message only, never the code)
 * so a still-failing link can be diagnosed from the Vercel
 * function logs.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin/reset-password";
  const safeNext =
    next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/admin/reset-password";
  const invalidUrl = new URL(
    "/admin/reset-password?error=invalid",
    request.url,
  );

  if (!code) {
    // No PKCE code — an implicit-flow link carries its session in
    // the URL hash instead, which the server never sees. The
    // reset page's client handler checks the hash next; this line
    // is the breadcrumb if the link still fails there. No code or
    // token is ever logged.
    console.error("[auth/callback] reset link had no code");
    return NextResponse.redirect(invalidUrl);
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error(
      "[auth/callback] code exchange failed:",
      error.message,
    );
    return NextResponse.redirect(invalidUrl);
  }
  return NextResponse.redirect(new URL(safeNext, request.url));
}
