import ResetLinkHandler from "@/components/admin/reset-link-handler";
import ResetPasswordForm from "@/components/admin/reset-password-form";
import { createAdminClient, getAdminUser } from "@/lib/supabase/admin";
import type { Metadata } from "next";

/** S-6, T-61, S6-10: the admin auth pages are noindex. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin reset-password page (S-6 follow-up) — outside the
 * (protected) route group on purpose: the visitor arrives here
 * from the recovery email, after /auth/callback exchanged the
 * code for a session. requireAdmin() is NOT used here — a fresh
 * recovery session has not done the MFA step yet, and the emailed
 * link itself is the verification. The page instead checks the
 * session + am_i_admin() and fails closed: no session, or a
 * non-admin session (signed straight out), sees only the
 * invalid-link message — never why the link failed.
 *
 * The callback route sends a failed exchange here as
 * ?error=invalid. That no longer shows the invalid message
 * immediately: the page renders ResetLinkHandler instead, which
 * first checks the URL hash in the browser — an implicit-flow
 * link (#access_token=...&refresh_token=...) carries its session
 * there, where the server can never see it. Only when the hash
 * holds no usable tokens does the handler show the same
 * invalid-link message.
 */

// The page reads the session (cookies()) — with Cache Components
// on, that blocks prerendering unless the segment is allowed to
// block (same `instant = false` opt-out as the login page).
export const instant = false;

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-10 sm:px-6">
      <p className="font-display text-xl font-bold text-text">RabbY</p>
      <div className="mt-6 w-full">{children}</div>
    </main>
  );
}

export default async function AdminResetPasswordPage() {
  let isAdminSession = false;
  try {
    const supabase = await createAdminClient();
    const user = await getAdminUser(supabase);
    if (user) {
      const { data: isAdmin } = await supabase.rpc("am_i_admin");
      if (isAdmin === true) {
        isAdminSession = true;
      } else {
        await supabase.auth.signOut();
      }
    }
  } catch {
    isAdminSession = false;
  }

  if (isAdminSession) {
    return (
      <PageShell>
        <ResetPasswordForm />
      </PageShell>
    );
  }

  // No valid admin session — the handler gets its chance first:
  // it reads the URL hash in the browser (implicit-flow links) and
  // shows the invalid-link message only when no usable tokens
  // are there. This also covers ?error=invalid from /auth/callback.
  return (
    <PageShell>
      <ResetLinkHandler />
    </PageShell>
  );
}
