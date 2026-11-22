"use client";

import { getSessionTimeoutKind } from "@/lib/admin-session";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Admin sign-out button. Signs out through the server route (which
 * uses the admin's own Supabase session) and then goes to the login
 * page. The button never touches auth state directly from the browser.
 */
export default function SignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    let loginUrl = "/admin/login";
    try {
      const res = await fetch("/api/admin/sign-out", { method: "POST" });
      // Timed out already (S-6 follow-up, D-S6-1): the proxy cleared
      // the session and answered 401 — carry its plain-words message
      // through to the login page instead of a bare redirect.
      if (res.status === 401) {
        const kind = getSessionTimeoutKind(
          await res.json().catch(() => ({})),
        );
        if (kind) {
          loginUrl = `/admin/login?session=${kind}`;
        }
      }
    } catch {
      // Even if the request fails, leave the admin area.
    }
    router.push(loginUrl);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-left font-semibold text-text hover:bg-background-subtle disabled:cursor-not-allowed disabled:opacity-50"
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
