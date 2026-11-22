"use client";

import { createBrowserClient } from "@/lib/supabase/browser-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Reset-link handler (S-6 follow-up) — client component for the
 * reset page, used when the server sees no valid admin session.
 *
 * Supabase recovery links come in two shapes. The PKCE shape
 * (?code=...) is handled server-side by /auth/callback. The
 * implicit shape carries the session in the URL hash
 * (#access_token=...&refresh_token=...) — the server can never see
 * a hash, so /auth/callback finds no code, redirects here with
 * ?error=invalid, and the browser still holds the hash. This
 * component picks the tokens up here, in the browser, with the
 * browser client (anon key only, like MFA enrollment).
 *
 * On success the session is stored in cookies and the admin is
 * sent to the plain reset page, so the server re-checks the
 * session and renders the password form. Every other outcome —
 * no tokens, an error in the hash, no browser client, a failed
 * setSession — shows the SAME invalid-link message as a bad PKCE
 * link, so the page never reveals why a link failed. Tokens are
 * never logged anywhere.
 */

type Status = "checking" | "invalid";

/** Read the hash tokens and try to set the session. No UI here — the caller sets state. */
async function tryHashSession(): Promise<"valid" | "invalid"> {
  const hash = window.location.hash;
  const params = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken || params.get("error")) {
    return "invalid";
  }
  const supabase = createBrowserClient();
  if (!supabase) {
    return "invalid";
  }
  try {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return error ? "invalid" : "valid";
  } catch {
    return "invalid";
  }
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

export default function ResetLinkHandler() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");

  // Same async-IIFE shape as MfaEnrollment's status check: the
  // helper returns data, state is set only after the await, so no
  // setState runs synchronously in the effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await tryHashSession();
      if (cancelled) {
        return;
      }
      if (result === "invalid") {
        setStatus("invalid");
        return;
      }
      router.replace("/admin/reset-password");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === "invalid") {
    return <InvalidLink />;
  }
  return (
    <p className="text-center text-text-secondary">
      Checking your reset link…
    </p>
  );
}
