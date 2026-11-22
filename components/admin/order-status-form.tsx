"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Order status update (S-4, T-46) — dropdown of the allowed next
 * statuses for this order + an optional note. On Cancel the note is
 * the cancel reason, so it is required. After a successful update
 * the page refreshes and the customer timeline (which reads
 * order_status_events) shows the new status.
 */
export default function OrderStatusForm({
  reference,
  currentStatus,
  allowedStatuses,
  statusLabels,
}: {
  reference: string;
  currentStatus: string;
  allowedStatuses: string[];
  statusLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * After a successful update the page refreshes (router.refresh())
   * with a new allowedStatuses list for the new current status, but
   * useState does not re-initialise — without this sync the form
   * keeps submitting the old status, so the second update in a row
   * (e.g. Processing -> Packed) silently re-saves the old status
   * and only a full page reload fixed it. This is the documented
   * "adjusting state when a prop changes" pattern: the state is
   * adjusted during render, not in an effect, so no cascading
   * render. The parent is a server component, so this prop identity
   * only changes when the order's status actually changes — typing
   * in the note field does not reset the selection.
   */
  const [status, setStatus] = useState(allowedStatuses[0] ?? "");
  const [prevAllowedStatuses, setPrevAllowedStatuses] =
    useState(allowedStatuses);
  if (allowedStatuses !== prevAllowedStatuses) {
    setPrevAllowedStatuses(allowedStatuses);
    setStatus(allowedStatuses[0] ?? "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!status) {
      setError("Choose a new status.");
      return;
    }
    if (status === "cancelled" && note.trim() === "") {
      setError("Enter a cancel reason.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${reference}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note.trim() || null }),
      });
      const json: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "The status could not be updated.");
        return;
      }
      setMessage(`Status updated to ${statusLabels[status] ?? status}.`);
      setNote("");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (allowedStatuses.length === 0) {
    return (
      <p className="text-text-secondary">
        This order is {statusLabels[currentStatus] ?? currentStatus} — no
        further status changes are available.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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
          New status
        </span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-text"
        >
          {allowedStatuses.map((next) => (
            <option key={next} value={next}>
              {statusLabels[next] ?? next}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-text">
          Note{status === "cancelled" ? " (cancel reason — required)" : " (optional)"}
        </span>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            status === "cancelled"
              ? "e.g. Customer asked to cancel"
              : "e.g. Packed and ready"
          }
          maxLength={500}
          className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-text placeholder:text-text-secondary"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="min-h-11 rounded-md bg-action px-6 py-3 font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Updating…" : "Update status"}
      </button>
    </form>
  );
}
