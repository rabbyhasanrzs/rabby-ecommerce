"use server";

import {
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_WINDOW_MS,
  checkRateLimit,
} from "@/lib/rate-limit";
import {
  createAdminClient,
  createPasswordResetClient,
} from "@/lib/supabase/admin";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Admin password reset (S-6 follow-up) — server actions.
 *
 * Flow: the admin asks for a reset link on /admin/forgot-password
 * -> Supabase emails an IMPLICIT-flow recovery link (no PKCE code
 * verifier is stored — the mail app opens the link in a different
 * cookie jar than the browser that requested it, so a PKCE link
 * fails at the callback with "code verifier not found") -> the
 * link lands on /auth/callback with the session in the URL hash,
 * which redirects to /admin/reset-password with the hash preserved
 * -> the reset page's client handler sets the session from the hash
 * -> the admin sets a new password, is signed out, and signs in
 * again with the new password (MFA code included, as usual).
 *
 * The reset email goes out through Supabase Auth's own mail, not
 * the Gmail used for order emails — no custom SMTP is configured
 * for Supabase. The link points at the deployment the request
 * came from (staging / preview / production), built from the
 * request host, not the hardcoded production SITE_URL.
 *
 * Nothing here reveals whether an email belongs to an account:
 * the forgot form always shows the same "check your inbox"
 * message, and the reset page never says why a link failed.
 * Only admins exist in Supabase Auth (customers are guests), and
 * the reset page + this action both check am_i_admin() and fail
 * closed — a non-admin session is signed straight back out.
 */

const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * Best-effort client identity for the reset rate-limit key: the
 * first IP in x-forwarded-for (set by Vercel's edge in
 * production), else "unknown". Mirrors getLoginClientIp in
 * login-actions.ts. Server actions have no Request object, so
 * this reads next/headers directly.
 */
async function getResetClientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return "unknown";
}

/**
 * Origin of the deployment this request reached (staging, a
 * preview, or production), from the request host. The reset link
 * must come back here — the hardcoded production SITE_URL would
 * send a staging admin to the production reset page.
 */
async function getRequestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("host");
  if (!host) {
    throw new Error("Could not determine the site address");
  }
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function requestPasswordResetAction(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // Same per-IP budget as sign-in (S-6, T-61, S6-05): a reset
  // email is cheap to trigger, so it gets the same 10 / 10 minutes.
  const resetLimit = checkRateLimit(
    `reset:ip:${await getResetClientIp()}`,
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW_MS,
  );
  if (!resetLimit.allowed) {
    return { ok: false, error: RATE_LIMIT_ERROR };
  }

  // The reset email goes out through the implicit-flow client:
  // no PKCE verifier is stored, so the link works even when the
  // mail app opens it in a different cookie jar (see
  // createPasswordResetClient in lib/supabase/admin.ts).
  const supabase = createPasswordResetClient();
  const origin = await getRequestOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${origin}/auth/callback?next=/admin/reset-password`,
  });
  if (error) {
    // A real failure (mail not working, network) — not "unknown
    // email": Supabase returns success for unknown emails, so an
    // error here means the service itself failed, and the plain
    // generic message is honest without revealing anything.
    return { ok: false, error: GENERIC_ERROR };
  }
  return { ok: true };
}

export async function resetPasswordAction(
  newPassword: string,
  confirmPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!newPassword || !confirmPassword) {
    return { ok: false, error: "Enter your new password twice." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  const supabase = await createAdminClient();

  // Fail closed: only an admin may change a password through
  // this action. A non-admin session is signed straight out.
  const { data: isAdmin } = await supabase.rpc("am_i_admin");
  if (isAdmin !== true) {
    await supabase.auth.signOut();
    return { ok: false, error: GENERIC_ERROR };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) {
    if (error.message.toLowerCase().includes("at least")) {
      return {
        ok: false,
        error: "That password is too short. Use a longer one.",
      };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  // The recovery session ends here: sign out, then sign in again
  // with the new password (MFA code included, as usual).
  await supabase.auth.signOut();
  redirect("/admin/login?reset=1");
}
