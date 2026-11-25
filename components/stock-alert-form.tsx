"use client";

import { useState } from "react";

/**
 * Back-in-stock alert form (S-7; no documented scope,
 * owner-approved standard setup).
 *
 * Renders only on the PDP out-of-stock branch — the form is absent
 * on in-stock products. One purpose, one field: the email is the
 * only identity (guest-first, no accounts) and the only channel.
 * The purpose is stated on the form ("We'll email you only when
 * this product is back in stock.") — the email is never collected
 * without saying why.
 *
 * States, in plain words: not yet subscribed -> form; subscribed
 * -> "We'll email you when this is back in stock." (the form
 * hides); an already-subscribed email gets the SAME message — the
 * server no-ops on the dedupe, so the form can never reveal
 * whether an email is on the list. An invalid email gets the exact
 * message the checkout form already uses.
 */
export default function StockAlertForm({
  productSlug,
  productName,
}: {
  productSlug: string;
  productName: string;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (email.trim() === "") {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSlug, email: email.trim() }),
      });
      let json: { ok?: boolean; error?: string } | null = null;
      try {
        json = (await res.json()) as { ok?: boolean; error?: string };
      } catch {
        // The server answered with something that is not JSON —
        // treat it as a generic failure, never a crash.
        json = null;
      }
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubscribed(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (subscribed) {
    return (
      <p
        role="status"
        className="mt-8 rounded-md border border-border bg-background-subtle px-4 py-3 text-base text-text"
      >
        We&apos;ll email you when this is back in stock.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 rounded-md border border-border bg-background-subtle px-4 py-4"
    >
      <p className="text-base font-semibold text-text">
        Get notified when it&apos;s back
      </p>
      <p className="mt-1 text-sm text-text-secondary">
        We&apos;ll email you only when this product is back in stock.
      </p>
      <label
        htmlFor="stock-alert-email"
        className="mt-3 block text-sm font-semibold text-text"
      >
        Email address
      </label>
      <input
        id="stock-alert-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setError(null);
        }}
        placeholder="you@example.com"
        aria-label={`Email address for stock alerts on ${productName}`}
        className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text"
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-md bg-action px-4 py-3 text-base font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Notify me"}
      </button>
    </form>
  );
}
