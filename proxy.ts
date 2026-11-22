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
 * What this proxy does, on /admin/* requests only (see `config`
 * below):
 *   1. Refresh the Supabase session from the request cookies (the
 *      @supabase/ssr createServerClient cookie dance), so a
 *      signed-in admin stays signed in.
 *   2. Redirect a request with NO session for /admin/* (except
 *      /admin/login) to /admin/login.
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

  if (pathname !== "/admin/login" && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*"],
};
