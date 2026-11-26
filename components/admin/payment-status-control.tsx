"use client";

import { getSessionTimeoutKind } from "@/lib/admin-session";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Payment status control (S-4, T-46) — shown only while the payment
 * is pending. Marks a mobile-banking / card payment paid or failed
 * (pending → paid/failed is the only move the server allows). The
 * sender number is never shown here or anywhere in the admin UI.
 * The optional note is sent with the marking and, on Failed, goes
 * to the customer verbatim in the payment-failed email (S-7) — it
 * is the only place the per-order reason lives, so the input
 * labels it customer-visible. The control never promises an email:
 * the proof an email went out is notification_log.
 */
export default function PaymentStatusControl({
  reference,
}: {
  reference: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<"paid" | "failed" | null>(null);

  async function handleUpdate(status: "paid" | "failed") {
    setError(null);
    setMessage(null);
    setSaving(status);
    try {
      const res = await fetch(`/api/admin/orders/${reference}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note.trim() || null }),
      });
      const json: { ok?: boolean; error?: string } = await res.json();
      // Timed out (S-6 follow-up, D-S6-1): the proxy answered 401
      // with a session kind — go to login with its message instead
      // of showing an update error.
      if (res.status === 401) {
        const kind = getSessionTimeoutKind(json);
        if (kind) {
          router.push(`/admin/login?session=${kind}`);
          return;
        }
      }
      if (!res.ok || !json.ok) {
        setError(json.error ?? "The payment status could not be updated.");
        return;
      }
      setMessage(
        status === "paid"
          ? "Payment marked as paid."
          : "Payment marked as failed.",
      );
      setNote("");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-md border border-error bg-surface px-4 py-3 text-text">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-md border border-border bg-surface px-4 py-3 text-text">
          {message}
        </p>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-text">
          Note (optional — the customer will see this on a failed
          payment)
        </span>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Transaction ID not found"
          maxLength={500}
          className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-text placeholder:text-text-secondary"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving !== null}
          onClick={() => handleUpdate("paid")}
          className="min-h-11 rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving === "paid" ? "Saving…" : "Mark as paid"}
        </button>
        <button
          type="button"
          disabled={saving !== null}
          onClick={() => handleUpdate("failed")}
          className="min-h-11 rounded-md border border-border bg-surface px-6 py-3 font-semibold text-text hover:bg-background-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving === "failed" ? "Saving…" : "Mark as failed"}
        </button>
      </div>
    </div>
  );
}
