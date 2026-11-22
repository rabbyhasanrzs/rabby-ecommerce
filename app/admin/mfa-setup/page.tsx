import MfaEnrollment from "@/components/admin/mfa-enrollment";
import {
  createAdminClient,
  getAdminUser,
} from "@/lib/supabase/admin";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

/** S-6, D-S6-2 (Slice B): the MFA setup page is noindex, like login. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * MFA setup page (S-6, D-S6-2 — Slice B) — OUTSIDE the
 * (protected) route group on purpose, like the login page: an admin
 * with no verified factor cannot pass requireAdmin(), so this page
 * must never call it (that would loop back here forever). It gates
 * itself directly with the session + am_i_admin RPC instead:
 * no session -> /admin/login; not an admin -> /admin/login?error=
 * forbidden; already enrolled AND at aal2 -> /admin (nothing to do
 * here). Otherwise it renders the enrollment component.
 *
 * The page itself grants no admin access — it only renders the
 * enrollment form, and the protected area stays gated by
 * requireAdmin() on every request. If the MFA status cannot be
 * read here, the form renders anyway and re-reads the status in
 * the browser.
 */

// The page reads the session (cookies()) — with Cache Components
// on, that blocks prerendering unless the segment is allowed to
// block (same `instant = false` opt-out as the login page and the
// (protected) layout).
export const instant = false;

export default async function AdminMfaSetupPage() {
  let supabase;
  try {
    supabase = await createAdminClient();
  } catch {
    // Supabase is not configured — nobody can be signed in.
    redirect("/admin/login");
  }

  const user = await getAdminUser(supabase);
  if (!user) {
    redirect("/admin/login");
  }

  const { data: isAdmin, error: adminError } =
    await supabase.rpc("am_i_admin");
  if (adminError || isAdmin !== true) {
    redirect("/admin/login?error=forbidden");
  }

  // Already enrolled and fully verified? Nothing to set up.
  try {
    const [{ data: factors }, { data: aal }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const hasVerifiedTotp = (factors?.totp ?? []).some(
      (factor: { status: string }) => factor.status === "verified",
    );
    if (hasVerifiedTotp && aal?.currentLevel === "aal2") {
      redirect("/admin");
    }
  } catch {
    // MFA status unreadable — render the form; it re-reads the
    // status in the browser and shows a plain-words error if it
    // still cannot be read.
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-10 sm:px-6">
      <p className="font-display text-xl font-bold text-text">RabbY</p>
      <div className="mt-6 w-full max-w-xl rounded-lg border border-border bg-surface p-6">
        <h1 className="font-display text-lg font-bold text-text">
          Set up two-factor authentication
        </h1>
        <p className="mt-1 text-text">
          Set up the authenticator code to use the admin area. You
          will need an authenticator app (for example Google
          Authenticator) and the 6-digit code it shows.
        </p>
        <div className="mt-4">
          <MfaEnrollment />
        </div>
        <p className="mt-4 text-sm">
          <Link href="/admin" className="font-semibold text-action hover:underline">
            Back to the admin area
          </Link>
        </p>
      </div>
    </main>
  );
}
