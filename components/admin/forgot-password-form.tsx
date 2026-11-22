"use client";

import { requestPasswordResetAction } from "@/components/admin/password-reset-actions";
import { useState } from "react";

/**
 * Forgot-password form (S-6 follow-up) — client component.
 *
 * The admin enters their email; the form never says whether an
 * account exists for it — the success message is the same either
 * way, so the page cannot be used to probe for admin emails.
 */

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await requestPasswordResetAction(email);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h1 className="font-display text-2xl font-bold text-text">
          Check your inbox
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          If an account exists for {email}, a password reset link has
          been sent to it. Open the link to set a new password.
        </p>
        <p className="mt-5 text-sm">
          <a
            href="/admin/login"
            className="font-semibold text-text-secondary hover:text-action"
          >
            Back to sign in
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-surface p-6">
      <h1 className="font-display text-2xl font-bold text-text">
        Forgot password?
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Enter your admin email and we will send you a link to set a
        new password.
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-error bg-surface px-3 py-2 text-sm text-error"
        >
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <div>
          <label
            htmlFor="reset-email"
            className="mb-1 block font-semibold text-text"
          >
            Email
          </label>
          <input
            id="reset-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-md bg-action px-6 py-3 text-base font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-5 text-sm">
        <a
          href="/admin/login"
          className="font-semibold text-text-secondary hover:text-action"
        >
          Back to sign in
        </a>
      </p>
    </div>
  );
}
