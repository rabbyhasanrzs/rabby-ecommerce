"use client";

import {
  approveReviewAction,
  rejectReviewAction,
  type ReviewActionState,
} from "@/app/admin/(protected)/reviews/actions";
import { useActionState } from "react";

/**
 * Approve / Reject buttons for one review in the moderation queue.
 *
 * Each button is its own form posting to a server action; the
 * action revalidates /admin/reviews, so the queue refreshes in
 * place. A review is never hard-deleted — Reject only hides it
 * (status 'rejected'), and it can be approved later.
 */

function ModerationForm({
  reviewId,
  action,
  label,
  pendingLabel,
  variant,
}: {
  reviewId: string;
  action: (
    prevState: ReviewActionState | null,
    formData: FormData,
  ) => Promise<ReviewActionState>;
  label: string;
  pendingLabel: string;
  variant: "approve" | "reject";
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="review_id" value={reviewId} />
      <button
        type="submit"
        disabled={isPending}
        className={
          variant === "approve"
            ? "inline-flex min-h-11 items-center rounded-md bg-action px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
            : "inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:border-action disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isPending ? pendingLabel : label}
      </button>
      {state && !state.ok ? (
        <p role="alert" className="mt-1 text-sm text-error">
          {state.message}
        </p>
      ) : null}
      {state && state.ok ? (
        <p role="status" className="mt-1 text-sm text-text-secondary">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export default function ReviewModerationButtons({
  reviewId,
  status,
}: {
  reviewId: string;
  status: "pending" | "approved" | "rejected";
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {status !== "approved" ? (
        <ModerationForm
          reviewId={reviewId}
          action={approveReviewAction}
          label="Approve"
          pendingLabel="Approving…"
          variant="approve"
        />
      ) : null}
      {status !== "rejected" ? (
        <ModerationForm
          reviewId={reviewId}
          action={rejectReviewAction}
          label="Reject"
          pendingLabel="Rejecting…"
          variant="reject"
        />
      ) : null}
    </div>
  );
}
