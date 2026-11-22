import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_OPTIONS,
  ADMIN_SESSION_TIMEOUT_MESSAGES,
  buildAdminSessionValue,
  checkSessionTimeout,
  refreshAdminSessionValue,
  serializeAdminSessionValue,
} from "@/lib/admin-session";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (S-4, T-40) — Next 16.4 convention.
 *
 * Per the installed Next.js docs (node_modules/next/dist/docs,
 * "middleware to proxy" in the version-16 upgrade guide), the
 * `middleware` filename is deprecated in Next 16 and renamed to
 * `proxy`; the exported function is `proxy`, it runs on the Node.js
 * runtime, and the `edge` runtime is not supported in it.
 *
 * What this proxy does, on /admin/* and /api/admin/* requests
 * (see `config` below):
 *   1. Refresh the Supabase session from the request cookies (the
 *      @supabase/ssr createServerClient cookie dance), so a
 *      signed-in admin stays signed in.
 *   2. Redirect a request with NO session for /admin/* (except
 *      /admin/login) to /admin/login. An /api/admin/* request with
 *      no session gets a 401 JSON instead — a fetch caller cannot
 *      use an HTML redirect.
 *   3. Enforce the admin session timeout (S-6 follow-up, D-S6-1):
 *      30 minutes idle or 8 hours absolute since sign-in, tracked
 *      in the httpOnly `admin-session` cookie set at sign-in (see
 *      lib/admin-session.ts). On a passing request the cookie's
 *      last-activity is refreshed. On expiry the Supabase auth
 *      cookies AND the session cookie are cleared — a real sign-out,
 *      so navigating back does not restore access — and a page
 *      request is redirected to /admin/login?session=idle (or
 *      =absolute) while an API request gets a 401 JSON with the
 *      same kind in its `session` field.
 *      The login page itself is never locked out by the timeout.
 *      A signed-in admin with NO session cookie (signed in before
 *      this deploy) is backfilled with a fresh cookie — the clock
 *      starts now, so nobody is surprise-logged-out by the deploy.
 *
 * What it does NOT do: the role check. An authenticated non-admin
 * passes this proxy and is rejected by requireAdmin() in the
 * (protected) layout — the page-level gate remains the real role
 * gate, and the database (RLS + is_admin()) is the final one.
 * The proxy only ever reads the session from the cookie (an
 * optimistic check, per the Next.js auth guide) and never touches
 * the database.
 *
 * When the Supabase env vars are missing (e.g. a CI build with no
 * .env.local) the proxy does nothing and lets the request through —
 * the page-level requireAdmin() then handles the missing config.
 */
export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = pathname === "/admin/login";
  const isApi = pathname.startsWith("/api/admin/");

  if (!user) {
    if (isApi) {
      // A fetch caller cannot use the login redirect — answer JSON.
      return NextResponse.json(
        { ok: false, error: "Your session ended. Please sign in again." },
        { status: 401 },
      );
    }
    if (!isLoginPage) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }
    return supabaseResponse;
  }

  // The login page is never locked out by the timeout.
  if (isLoginPage) {
    return supabaseResponse;
  }

  const nowMs = Date.now();
  const rawSession = request.cookies.get(
    ADMIN_SESSION_COOKIE_NAME,
  )?.value;

  // No session cookie: signed in before this deploy. Backfill with
  // a fresh cookie — the clock starts now, no surprise logout.
  if (rawSession === undefined) {
    supabaseResponse.cookies.set(
      ADMIN_SESSION_COOKIE_NAME,
      serializeAdminSessionValue(buildAdminSessionValue(nowMs)),
      ADMIN_SESSION_COOKIE_OPTIONS,
    );
    return supabaseResponse;
  }

  const timeout = checkSessionTimeout(rawSession, nowMs);
  if (timeout !== "ok") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.searchParams.set("session", timeout);
    const response = isApi
      ? NextResponse.json(
          {
            ok: false,
            error: ADMIN_SESSION_TIMEOUT_MESSAGES[timeout],
            session: timeout,
          },
          { status: 401 },
        )
      : NextResponse.redirect(loginUrl);
    clearAdminSessionCookies(request, response);
    return response;
  }

  // Valid session — refresh last activity, keeping sign-in time.
  const refreshed = refreshAdminSessionValue(rawSession, nowMs);
  if (refreshed) {
    supabaseResponse.cookies.set(
      ADMIN_SESSION_COOKIE_NAME,
      refreshed,
      ADMIN_SESSION_COOKIE_OPTIONS,
    );
  }

  return supabaseResponse;
}

/**
 * Clear the Supabase auth cookies (every request cookie starting
 * with "sb-") and the session cookie, so a timed-out admin is
 * really signed out and navigating back cannot restore access.
 */
function clearAdminSessionCookies(
  request: NextRequest,
  response: NextResponse,
): void {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.delete(cookie.name);
    }
  }
  response.cookies.delete(ADMIN_SESSION_COOKIE_NAME);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
