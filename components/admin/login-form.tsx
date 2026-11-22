"use client";

import { signInAction, verifyMfaAction } from "@/components/admin/login-actions";
import { useState } from "react";

/**
 * Admin login form (S-4, T-40) — client component.
 *
 * Step 1: email + password (server action signInAction). Step 2
 * (only when the admin has MFA enrolled): a 6-digit authenticator
 * code (server action verifyMfaAction). Errors are plain words
 * only; the entered values stay in the fields after an error, and
 * the form never says whether an account exists or is an admin.
 * No demo credentials are shown or accepted anywhere.
 */

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text";

export default function LoginForm({
  initialError,
  mfaHint,
}: {
  /** Shown when redirected here by requireAdmin() (non-admin). */
  initialError?: string | null;
  /** Shown when redirected here by requireAdmin() (MFA re-check). */
  mfaHint?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);

  async function handleCredentialsSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await signInAction(new FormData(event.currentTarget));
      if (!result.ok) {
        setError(result.error ?? "Wrong email or password.");
        return;
      }
      if (result.needsMfa && result.factorId) {
        setFactorId(result.factorId);
        return;
      }
      // Full success redirects to /admin from the server action;
      // reaching here means the redirect did not happen, so show a
      // plain-words error rather than leaving the owner staring at
      // a dead form.
      setError("Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleMfaSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await verifyMfaAction(factorId, code);
      if (!result.ok) {
        setError(result.error ?? "Wrong code. Try again.");
        return;
      }
      setError("Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-surface p-6">
      <h1 className="font-display text-2xl font-bold text-text">
        Admin sign in
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        {factorId
          ? "Enter the 6-digit code from your authenticator app."
          : "Sign in with your admin email and password."}
      </p>
      {mfaHint && !factorId ? (
        <p className="mt-3 rounded-md border border-border bg-background-subtle px-3 py-2 text-sm text-text">
          Your session needs a fresh verification code. Sign in again.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-error bg-surface px-3 py-2 text-sm text-error"
        >
          {error}
        </p>
      ) : null}

      {factorId ? (
        <form
          onSubmit={handleMfaSubmit}
          className="mt-5 space-y-4"
          noValidate
        >
          <div>
            <label
              htmlFor="admin-mfa-code"
              className="mb-1 block font-semibold text-text"
            >
              Verification code
            </label>
            <input
              id="admin-mfa-code"
              name="code"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={inputClassName}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 w-full rounded-md bg-action px-6 py-3 text-base font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Checking…" : "Verify code"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setFactorId(null);
              setCode("");
              setError(null);
            }}
            className="w-full text-center text-sm font-semibold text-text-secondary hover:text-action"
          >
            Back to sign in
          </button>
        </form>
      ) : (
        <form
          onSubmit={handleCredentialsSubmit}
          className="mt-5 space-y-4"
          noValidate
        >
          <div>
            <label
              htmlFor="admin-email"
              className="mb-1 block font-semibold text-text"
            >
              Email
            </label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClassName}
            />
          </div>
          <div>
            <label
              htmlFor="admin-password"
              className="mb-1 block font-semibold text-text"
            >
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClassName}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 w-full rounded-md bg-action px-6 py-3 text-base font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}
