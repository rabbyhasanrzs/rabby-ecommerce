"use server";

import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_OPTIONS,
  buildAdminSessionValue,
  serializeAdminSessionValue,
} from "@/lib/admin-session";
import {
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_WINDOW_MS,
  checkRateLimit,
} from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Admin sign-in actions (S-4, T-40) — server actions, called from
 * components/admin/login-form.tsx.
 *
 * Flow: email + password -> Supabase Auth signInWithPassword. On
 * success the caller must ALSO be in public.admins (am_i_admin
 * RPC); a signed-in non-admin is signed straight back out and gets
 * the same "Wrong email or password." message as a bad password —
 * the form never reveals whether an account exists or is an admin.
 *
 * MFA: if the admin has a VERIFIED totp factor and the fresh session
 * is still aal1, sign-in stops at the code step — the action returns
 * { needsMfa: true, factorId } and the form shows the TOTP input.
 * verifyMfaAction() then runs mfa.challenge + mfa.verify in ONE
 * server call (the challenge id never leaves the server) and
 * redirects to /admin on success. An admin with no enrolled factor
 * goes straight to /admin.
 *
 * No demo credentials anywhere — the prototype's admin@rabby.demo /
 * demo1234 does NOT transfer. The admin user is created by the owner
 * in the Supabase Auth dashboard (see the owner checklist).
 */

export interface SignInResult {
  ok: boolean;
  /** Plain-words error for the form; never a Supabase message. */
  error?: string;
  /** True when the TOTP code step is required next. */
  needsMfa?: boolean;
  /** The verified totp factor to challenge (only with needsMfa). */
  factorId?: string;
}

const WRONG_CREDENTIALS = "Wrong email or password.";
const RATE_LIMIT_ERROR =
  "Too many attempts. Please try again in a few minutes.";

/**
 * Set the admin-session cookie (S-6 follow-up, D-S6-1). The clock
 * starts at successful sign-in — call this only once sign-in is
 * complete, in BOTH completion paths (direct and after the MFA
 * code), and BEFORE redirect() (which throws). It is NOT set on the
 * needsMfa return: MFA is not complete yet, and the MFA step must
 * not stretch the clock into a longer session than intended.
 */
async function setAdminSessionCookie(): Promise<void> {
  (await cookies()).set(
    ADMIN_SESSION_COOKIE_NAME,
    serializeAdminSessionValue(buildAdminSessionValue(Date.now())),
    ADMIN_SESSION_COOKIE_OPTIONS,
  );
}

/**
 * Best-effort client identity for the login rate-limit key: the
 * first IP in x-forwarded-for (set by Vercel's edge in production),
 * else "unknown". Server actions have no Request object, so this
 * reads next/headers directly.
 */
async function getLoginClientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return "unknown";
}

export async function signInAction(
  formData: FormData,
): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: WRONG_CREDENTIALS };
  }

  // S-6 (T-61, S6-05): 10 attempts / 10 minutes per IP, checked
  // before Supabase is called. A distinct message (not the generic
  // wrong-credentials shape) so a rate-limited owner is not misled
  // into thinking his password is wrong; it reveals nothing about
  // whether the email exists, because it appears only after 10
  // attempts from that IP.
  const signInLimit = checkRateLimit(
    `login:ip:${await getLoginClientIp()}`,
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW_MS,
  );
  if (!signInLimit.allowed) {
    return { ok: false, error: RATE_LIMIT_ERROR };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return { ok: false, error: WRONG_CREDENTIALS };
  }

  // Signed in — but is this user an admin?
  const { data: isAdmin } = await supabase.rpc("am_i_admin");
  if (isAdmin !== true) {
    await supabase.auth.signOut();
    return { ok: false, error: WRONG_CREDENTIALS };
  }

  // MFA required? Only a VERIFIED totp factor counts as enrolled.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).filter(
    (factor: { status: string }) => factor.status === "verified",
  );
  if (verified.length > 0) {
    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal1") {
      return { ok: true, needsMfa: true, factorId: verified[0].id };
    }
  }

  await setAdminSessionCookie();
  redirect("/admin");
}

export async function verifyMfaAction(
  factorId: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const cleanCode = code.trim();
  if (!factorId || !cleanCode) {
    return { ok: false, error: "Wrong code. Try again." };
  }

  // S-6 (T-61, S6-05): same per-IP budget as sign-in, so the 6-digit
  // TOTP code cannot be brute-forced through repeated verify calls.
  const mfaLimit = checkRateLimit(
    `login-mfa:ip:${await getLoginClientIp()}`,
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW_MS,
  );
  if (!mfaLimit.allowed) {
    return { ok: false, error: RATE_LIMIT_ERROR };
  }

  const supabase = await createAdminClient();
  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    return { ok: false, error: "Wrong code. Try again." };
  }
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: cleanCode,
  });
  if (error) {
    return { ok: false, error: "Wrong code. Try again." };
  }

  await setAdminSessionCookie();
  redirect("/admin");
}
