import ForgotPasswordForm from "@/components/admin/forgot-password-form";
import {
  checkAdminAccess,
  createAdminClient,
} from "@/lib/supabase/admin";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

/** S-6, T-61, S6-10: the admin auth pages are noindex. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin forgot-password page (S-6 follow-up) — outside the
 * (protected) route group on purpose: this page must render for
 * logged-out visitors. An already signed-in, fully verified admin
 * is sent straight to /admin. The proxy lets logged-out visitors
 * reach this page (see the public admin pages in proxy.ts).
 */

// The page reads the session (cookies()) to skip the form for an
// already signed-in admin — with Cache Components on, that blocks
// prerendering unless the segment is allowed to block (same
// `instant = false` opt-out as the login page).
export const instant = false;
export default async function AdminForgotPasswordPage() {
  // Request-time rendering FIRST, before the session read:
  // checkAdminAccess() reads the session with supabase.auth.getUser(),
  // and @supabase/auth-js checks the token expiry with Date.now() on
  // every such call — Next 16 (Cache Components) flags that as an
  // unstable value during prerendering ("Route ... encountered the
  // unstable value `Date.now()` while prerendering"). Same fix as the
  // (protected) layout (PR #34): connection() before the session read.
  // The try/catch below cannot do this job — it swallows the dynamic
  // bailout, so the read still runs during the prerender attempt.
  await connection();

  // Already signed in as a verified admin? Skip the form.
  try {
    const supabase = await createAdminClient();
    const access = await checkAdminAccess(supabase);
    if (access.status === "ok") {
      redirect("/admin");
    }
    // S-6, D-S6-2 (Slice B): signed in as an admin but no verified
    // MFA factor yet — send them to enrollment, not the Dashboard.
    if (access.status === "mfa-missing") {
      redirect("/admin/mfa-setup?required=1");
    }
  } catch {
    // No session / Supabase not configured — render the form.
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-10 sm:px-6">
      <p className="font-display text-xl font-bold text-text">RabbY</p>
      <div className="mt-6 w-full">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
