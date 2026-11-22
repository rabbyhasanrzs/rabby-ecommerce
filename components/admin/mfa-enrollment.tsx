"use client";

import { createBrowserClient } from "@/lib/supabase/browser-client";
import { useEffect, useState } from "react";

/**
 * MFA enrollment (S-4, T-40) — client component for the protected
 * area (Slice C places it on the Settings page).
 *
 * All client-side with the browser Supabase client (anon key only):
 * enroll a TOTP factor, verify it with a code from the
 * authenticator app, show the current status, and unenroll.
 * Unenrolling needs a FRESH code from the authenticator app first
 * (S-6, D-S6-2): one-click unenroll without it is gone, so a
 * signed-in session alone cannot drop the admin to password-only.
 *
 * The secret + otpauth URL are shown as TEXT the owner can type
 * into their authenticator app manually — no QR-code library is
 * added. The code step runs mfa.challenge + mfa.verify in the same
 * handler. Once a factor is verified, requireAdmin() (server) and
 * the login flow treat the admin as MFA-enrolled and require the
 * code on every fresh sign-in.
 *
 * No QR code, no secret in the repo, no demo credentials.
 */

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text";

type Status = "loading" | "enrolled" | "not-enrolled" | "error";

type MfaStatusResult =
  | { status: "enrolled"; factorId: string }
  | { status: "not-enrolled"; factorId: null }
  | { status: "error"; error: string };

/** Read the current MFA state. Returns data only — callers set state. */
async function fetchMfaStatus(): Promise<MfaStatusResult> {
  const supabase = createBrowserClient();
  if (!supabase) {
    return { status: "error", error: "Supabase is not configured." };
  }
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { status: "error", error: "Sign in as admin first." };
  }
  const { data: factors, error: factorsError } =
    await supabase.auth.mfa.listFactors();
  if (factorsError) {
    return {
      status: "error",
      error: "Could not check MFA status. Please try again.",
    };
  }
  const verified = (factors?.totp ?? []).find(
    (factor: { status: string }) => factor.status === "verified",
  );
  if (verified) {
    return { status: "enrolled", factorId: verified.id };
  }
  return { status: "not-enrolled", factorId: null };
}

export default function MfaEnrollment() {
  const [status, setStatus] = useState<Status>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  /** Re-read the MFA state into the component (event handlers only). */
  async function refreshStatus() {
    const result = await fetchMfaStatus();
    if (result.status === "error") {
      setStatus("error");
      setError(result.error);
      return;
    }
    setFactorId(result.factorId);
    setStatus(result.status);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchMfaStatus();
      if (cancelled) {
        return;
      }
      if (result.status === "error") {
        setStatus("error");
        setError(result.error);
        return;
      }
      setFactorId(result.factorId);
      setStatus(result.status);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnroll() {
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const supabase = createBrowserClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        return;
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (enrollError || !data) {
        setError("Could not start enrollment. Please try again.");
        return;
      }
      setFactorId(data.id);
      setSecret(data.totp.secret);
      setUri(data.totp.uri);
    } catch {
      setError("Could not start enrollment. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) {
      return;
    }
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const supabase = createBrowserClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        return;
      }
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) {
        setError("Wrong code. Try again.");
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) {
        setError("Wrong code. Try again.");
        return;
      }
      setSecret(null);
      setUri(null);
      setCode("");
      setMessage(
        "Two-factor authentication is on. Your next sign-in will ask for a code.",
      );
      await refreshStatus();
    } catch {
      setError("Wrong code. Try again.");
    } finally {
      setPending(false);
    }
  }

  /**
   * Turn MFA off — only after a FRESH code proves the admin holds
   * the authenticator right now (S-6, D-S6-2). A wrong code shows
   * an error and does NOT unenroll. After a successful unenroll,
   * mandatory MFA sends the admin back to enrollment on the next
   * navigation — that is intended, not a lockout: they can
   * re-enroll immediately.
   */
  async function handleUnenroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) {
      return;
    }
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const supabase = createBrowserClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        return;
      }
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) {
        setError("Could not check the code. Please try again.");
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) {
        setError("Wrong code. Try again.");
        return;
      }
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });
      if (unenrollError) {
        setError("Could not turn off two-factor authentication. Please try again.");
        return;
      }
      setSecret(null);
      setUri(null);
      setCode("");
      setMessage(
        "Two-factor authentication is off. Set it up again to keep using the admin area — the admin area will ask you to set it up on your next visit.",
      );
      await refreshStatus();
    } catch {
      setError("Could not turn off two-factor authentication. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the text stays visible to type in.
    }
  }

  if (status === "loading") {
    return <p className="text-text-secondary">Checking MFA status…</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold text-text">
        Two-factor authentication
      </h3>
      {status === "error" ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      {status === "enrolled" ? (
        <p className="text-text">
          Two-factor authentication is on for this admin account. Sign-in
          asks for a code from your authenticator app.
        </p>
      ) : status === "not-enrolled" && !secret ? (
        <p className="text-text">
          Two-factor authentication is off. Turn it on to protect the
          admin area — you will need your authenticator app at sign-in.
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm font-semibold text-text">
          {message}
        </p>
      ) : null}
      {error && status !== "error" ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      {status === "enrolled" ? (
        <form onSubmit={handleUnenroll} className="space-y-4" noValidate>
          <p className="text-sm text-text-secondary">
            To turn it off, enter the code from your authenticator app
            first — turning it off without a code is not allowed.
          </p>
          <div>
            <label
              htmlFor="mfa-unenroll-code"
              className="mb-1 block font-semibold text-text"
            >
              Code from your authenticator app
            </label>
            <input
              id="mfa-unenroll-code"
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
            className="min-h-11 rounded-md border border-border bg-surface px-4 py-2 text-base font-semibold text-text hover:bg-background-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Working…" : "Turn off two-factor authentication"}
          </button>
        </form>
      ) : null}

      {status === "not-enrolled" && !secret ? (
        <button
          type="button"
          disabled={pending}
          onClick={handleEnroll}
          className="min-h-11 rounded-md bg-action px-4 py-2 text-base font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Working…" : "Set up two-factor authentication"}
        </button>
      ) : null}

      {secret ? (
        <form onSubmit={handleVerify} className="space-y-4" noValidate>
          <p className="text-text">
            Add this account to your authenticator app. Type the secret
            in by hand, or paste the setup link into the app — no QR
            code is shown.
          </p>
          <div>
            <p className="mb-1 font-semibold text-text">Secret</p>
            <code className="block break-all rounded-md border border-border bg-background-subtle px-3 py-2 text-sm text-text">
              {secret}
            </code>
            <button
              type="button"
              onClick={() => handleCopy(secret)}
              className="mt-1 text-sm font-semibold text-action hover:underline"
            >
              {copied ? "Copied." : "Copy secret"}
            </button>
          </div>
          {uri ? (
            <div>
              <p className="mb-1 font-semibold text-text">Setup link</p>
              <code className="block break-all rounded-md border border-border bg-background-subtle px-3 py-2 text-sm text-text">
                {uri}
              </code>
            </div>
          ) : null}
          <div>
            <label
              htmlFor="mfa-enroll-code"
              className="mb-1 block font-semibold text-text"
            >
              Code from your authenticator app
            </label>
            <input
              id="mfa-enroll-code"
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
            className="min-h-11 rounded-md bg-action px-4 py-2 text-base font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Checking…" : "Verify and turn on"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
