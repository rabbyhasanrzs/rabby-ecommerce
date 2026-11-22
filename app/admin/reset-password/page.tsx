import ResetPasswordForm from "@/components/admin/reset-password-form";
import { createAdminClient, getAdminUser } from "@/lib/supabase/admin";
import type { Metadata } from "next";
import Link from "next/link";

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
 * ?error=invalid, which shows the same message.
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

function InvalidLink() {
  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-surface p-6">
      <h1 className="font-display text-2xl font-bold text-text">
        This reset link is not valid
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        It may have expired or already been used. Request a new one
        and open it promptly.
      </p>
      <p className="mt-5 text-sm">
        <Link
          href="/admin/forgot-password"
          className="font-semibold text-text-secondary hover:text-action"
        >
          Request a new reset link
        </Link>
      </p>
    </div>
  );
}

export default async function AdminResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  if (params.error) {
    return (
      <PageShell>
        <InvalidLink />
      </PageShell>
    );
  }

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

  if (!isAdminSession) {
    return (
      <PageShell>
        <InvalidLink />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ResetPasswordForm />
    </PageShell>
  );
}
