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

/**
 * A server action that ends in redirect() throws NEXT_REDIRECT —
 * the navigation still happens, but the throw also lands in the
 * submit handler's catch. It must be ignored there, not turned
 * into a "Something went wrong" flash on a successful sign-in.
 * Same rule as components/admin/settings-form.tsx (which re-throws
 * it); here the direct action call navigates regardless, so
 * ignoring it is enough. Identified by message or digest (see
 * next/dist/client/components/redirect-error.js, which reads the
 * digest).
 */
function isRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.message.includes("NEXT_REDIRECT")) {
    return true;
  }
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function LoginForm({
  initialError,
  mfaHint,
  sessionMessage,
}: {
  /** Shown when redirected here by requireAdmin() (non-admin). */
  initialError?: string | null;
  /** Shown when redirected here by requireAdmin() (MFA re-check). */
  mfaHint?: boolean;
  /**
   * Plain-words timeout message (?session=idle / =absolute,
   * S-6 follow-up, D-S6-1). A separate slot from the error one:
   * this is information, not a sign-in failure.
   */
  sessionMessage?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    } catch (error) {
      if (isRedirectError(error)) {
        return;
      }
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
    } catch (error) {
      if (isRedirectError(error)) {
        return;
      }
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
      {sessionMessage && !factorId ? (
        <p className="mt-3 rounded-md border border-border bg-background-subtle px-3 py-2 text-sm text-text">
          {sessionMessage}
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
            <div className="relative">
              <input
                id="admin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${inputClassName} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary hover:text-action"
              >
                {showPassword ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                    <line x1="4" y1="4" x2="20" y2="20" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
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
