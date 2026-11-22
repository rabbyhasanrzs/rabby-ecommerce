"use server";

import { createAdminClient } from "@/lib/supabase/admin";
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

export async function signInAction(
  formData: FormData,
): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: WRONG_CREDENTIALS };
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

  redirect("/admin");
}
