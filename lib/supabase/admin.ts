import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Admin auth — server-only helpers (S-4, T-40).
 *
 * The admin area is gated twice: this file's requireAdmin() runs on
 * every protected admin page/layout (server-side, before any data
 * loads), and the database enforces the same rule with RLS +
 * SECURITY DEFINER functions (migration 0005: is_admin() /
 * am_i_admin()). The proxy (proxy.ts) only refreshes the session
 * and redirects logged-out visitors to /admin/login — it is NOT the
 * role gate.
 *
 * MFA RULE (S-6, D-S6-2 — MFA is MANDATORY for every admin):
 * an admin must have a VERIFIED totp factor, and must complete a
 * second-factor challenge (aal2) before reaching /admin.
 * requireAdmin() enforces it: no verified factor -> the admin is
 * sent to /admin/mfa-setup?required=1 to enroll; a verified factor
 * with the current assurance level still 'aal1' -> sent back to
 * /admin/login?mfa=1 for the code step. If the MFA status cannot
 * be read (network/Auth error), the check FAILS CLOSED — access is
 * denied (mfa-required) and the admin lands on the login form,
 * where signing in again re-reads the factors. Enrollment and
 * unenrollment live in components/admin/mfa-enrollment.tsx;
 * unenrolling requires a fresh MFA code first.
 *
 * No service_role key is used anywhere — the anon key + the user's
 * own session cookies are the only credentials, and the admins table
 * has NO policies, so a direct read of it always returns nothing;
 * the role check goes through the am_i_admin() RPC instead.
 */

export function getSupabaseAdminEnv(): {
  url: string;
  anonKey: string;
} | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

/**
 * Cookie-based server client (anon key). Throws when the public env
 * vars are missing — callers that render a public fallback (e.g. the
 * login page) catch that and render the form anyway.
 */
export async function createAdminClient(): Promise<SupabaseClient> {
  const env = getSupabaseAdminEnv();
  if (!env) {
    throw new Error("Supabase is not configured");
  }
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // setAll runs inside Server Components / Server Actions, where
        // setting cookies can throw (e.g. during a static render) —
        // the Supabase docs' pattern is to swallow that here: the
        // session refresh still happens on the next request.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Ignore — see the comment above.
        }
      },
    },
  });
}

/** The authenticated user, or null when there is no session. */
export async function getAdminUser(
  client?: SupabaseClient,
): Promise<User | null> {
  const supabase = client ?? (await createAdminClient());
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

export type AdminAccess =
  | { status: "ok"; user: User }
  | {
      status:
        | "unauthenticated"
        | "forbidden"
        | "mfa-required"
        | "mfa-missing";
      user: null;
    };

/**
 * Pure access check, testable with a mocked client (see
 * lib/__tests__/admin-auth.test.ts — no network, no redirects).
 * Order of checks: session -> admin role (am_i_admin RPC) -> MFA.
 * A failed role lookup is treated as "not admin" (fail closed).
 */
export async function checkAdminAccess(
  client: SupabaseClient,
): Promise<AdminAccess> {
  const user = await getAdminUser(client);
  if (!user) {
    return { status: "unauthenticated", user: null };
  }

  const { data: isAdmin, error: adminError } =
    await client.rpc("am_i_admin");
  if (adminError || isAdmin !== true) {
    return { status: "forbidden", user: null };
  }

  // MFA (mandatory, D-S6-2): only a VERIFIED totp factor counts as
  // "enrolled". No verified factor -> "mfa-missing" (enroll first);
  // verified factor but still aal1 -> "mfa-required" (code step).
  // A factors/AAL read failure FAILS CLOSED: deny access rather
  // than let a password-only session through — the admin lands on
  // the login form and signing in again re-reads the factors.
  try {
    const [{ data: factors, error: factorsError }, { data: aal, error: aalError }] =
      await Promise.all([
        client.auth.mfa.listFactors(),
        client.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
    if (factorsError || aalError) {
      return { status: "mfa-required", user: null };
    }
    const hasVerifiedTotp = (factors?.totp ?? []).some(
      (factor: { status: string }) => factor.status === "verified",
    );
    if (!hasVerifiedTotp) {
      return { status: "mfa-missing", user: null };
    }
    if (aal?.currentLevel === "aal1") {
      return { status: "mfa-required", user: null };
    }
  } catch {
    // MFA status unreadable (thrown, not an error field) — fail
    // closed, same as an error field above.
    return { status: "mfa-required", user: null };
  }

  return { status: "ok", user };
}

/**
 * Server-side gate for protected admin pages/layouts (Slice B's
 * (protected) layout calls this). Redirects — never returns null —
 * so a page that calls it only ever renders for a fully verified
 * admin. `client` is injectable for tests; production callers omit it.
 */
export async function requireAdmin(
  client?: SupabaseClient,
): Promise<User> {
  if (!client && !getSupabaseAdminEnv()) {
    // Supabase is not configured (e.g. a build with no env vars, like
    // CI): nobody can be signed in, so this is exactly a logged-out
    // visit — redirect to the login page instead of throwing during
    // prerender, which would fail the build. At runtime the vars are
    // always set (Vercel), so this path never triggers there.
    redirect("/admin/login");
    // redirect() throws in Next.js, but its type does not say so — the
    // throw below keeps TypeScript (and any non-Next runtime) from
    // falling through with no user.
    throw new Error("Admin redirect failed");
  }
  const supabase = client ?? (await createAdminClient());
  const access = await checkAdminAccess(supabase);
  if (access.status !== "ok") {
    const url =
      access.status === "unauthenticated"
        ? "/admin/login"
        : access.status === "forbidden"
          ? "/admin/login?error=forbidden"
          : access.status === "mfa-missing"
            ? "/admin/mfa-setup?required=1"
            : "/admin/login?mfa=1";
    redirect(url);
    // redirect() throws in Next.js, but its type does not say so —
    // the throw below keeps TypeScript (and any non-Next runtime)
    // from falling through with no user.
    throw new Error("Admin redirect failed");
  }
  return access.user;
}
