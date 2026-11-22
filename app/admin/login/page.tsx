import LoginForm from "@/components/admin/login-form";
import {
  checkAdminAccess,
  createAdminClient,
} from "@/lib/supabase/admin";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

/** S-6, T-61, S6-10: the admin login page is noindex. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin login page (S-4, T-40) — outside the (protected) route
 * group on purpose: this page must render for logged-out visitors.
 * An already signed-in, fully verified admin is sent straight to
 * /admin. A non-admin who lands here via requireAdmin() sees a
 * plain-words message (?error=forbidden); an admin whose session
 * needs a fresh MFA check sees the ?mfa=1 hint.
 */

// The page reads the session (cookies()) to skip the form for an
// already signed-in admin — with Cache Components on, that blocks
// prerendering unless the segment is allowed to block (same
// `instant = false` opt-out as the (protected) layout; see the
// Next.js Cache Components migration guide).
export const instant = false;
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mfa?: string }>;
}) {
  const params = await searchParams;

  // Already signed in as a verified admin? Skip the form.
  try {
    const supabase = await createAdminClient();
    const access = await checkAdminAccess(supabase);
    if (access.status === "ok") {
      redirect("/admin");
    }
  } catch {
    // No session / Supabase not configured — render the form.
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-10 sm:px-6">
      <p className="font-display text-xl font-bold text-text">RabbY</p>
      <div className="mt-6 w-full">
        <LoginForm
          initialError={
            params.error === "forbidden"
              ? "You do not have admin access."
              : null
          }
          mfaHint={params.mfa === "1"}
        />
      </div>
    </main>
  );
}
