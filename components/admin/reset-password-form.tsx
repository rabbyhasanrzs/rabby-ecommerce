"use client";

import { resetPasswordAction } from "@/components/admin/password-reset-actions";
import { useState } from "react";

/**
 * Set-a-new-password form (S-6 follow-up) — client component.
 *
 * Shown on /admin/reset-password after the recovery link has been
 * exchanged for a session. Both fields have the same eye toggle
 * as the login form. A successful change redirects to /admin/login
 * (the action signs the recovery session out first) — the redirect
 * throw is ignored here, exactly as in login-form.tsx, so no false
 * error flashes on success.
 */

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text";

/**
 * A server action that ends in redirect() throws NEXT_REDIRECT —
 * the navigation still happens, but the throw also lands in the
 * submit handler's catch. It must be ignored there, not turned
 * into a "Something went wrong" flash. Same rule as
 * components/admin/login-form.tsx. Identified by message or digest
 * (see next/dist/client/components/redirect-error.js, which reads
 * the digest).
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

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
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
      {hidden ? <line x1="4" y1="4" x2="20" y2="20" /> : null}
    </svg>
  );
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  show,
  onToggleShow,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block font-semibold text-text"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClassName} pr-11`}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary hover:text-action"
        >
          <EyeIcon hidden={show} />
        </button>
      </div>
    </div>
  );
}

export default function ResetPasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await resetPasswordAction(newPassword, confirmPassword);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Success redirects to /admin/login from the server action;
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

  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-surface p-6">
      <h1 className="font-display text-2xl font-bold text-text">
        Set a new password
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Choose a new password for your admin account. You will sign
        in again with it right after.
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
        <PasswordField
          id="new-password"
          label="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
          show={showNewPassword}
          onToggleShow={() => setShowNewPassword((value) => !value)}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          show={showConfirmPassword}
          onToggleShow={() => setShowConfirmPassword((value) => !value)}
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-md bg-action px-6 py-3 text-base font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
