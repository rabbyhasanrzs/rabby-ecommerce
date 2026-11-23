"use server";

import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Review moderation actions — S-7, T-70 (reviews).
 *
 * Approve / reject only change the status: a rejected review is
 * kept, hidden, and can be approved later (and vice versa).
 * Delete is the exception, added at the owner's request: it hard-
 * deletes the row, permanently — a deleted review cannot be
 * recovered. All three actions are requireAdmin-guarded and write
 * through the admin's JWT client (RLS reviews_admin_all, FOR ALL
 * with DELETE granted, migration 0010 — no new migration needed).
 */

export interface ReviewActionState {
  ok: boolean;
  message: string;
}

const reviewIdSchema = z.object({
  reviewId: z.string().uuid("That review couldn't be found."),
});

/** The admin client, untyped (same pattern as Slice B's admin-data.ts). */
async function adminClient(): Promise<SupabaseClient> {
  return (await createAdminClient()) as unknown as SupabaseClient;
}

async function updateReviewStatus(
  formData: FormData,
  status: "approved" | "rejected",
): Promise<ReviewActionState> {
  await requireAdmin();
  const parsed = reviewIdSchema.safeParse({
    reviewId: formData.get("review_id"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the review and try again.",
    };
  }
  const supabase = await adminClient();
  const { error } = await supabase
    .from("reviews")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.reviewId);
  if (error) {
    return {
      ok: false,
      message: "The review couldn't be updated. Please try again.",
    };
  }
  revalidatePath("/admin/reviews");
  return {
    ok: true,
    message:
      status === "approved"
        ? "Review approved — it now shows on the product page."
        : "Review rejected — it stays in the list, hidden from customers.",
  };
}

/** Approve a pending (or rejected) review — it goes live. */
export async function approveReviewAction(
  _prevState: ReviewActionState | null,
  formData: FormData,
): Promise<ReviewActionState> {
  return updateReviewStatus(formData, "approved");
}

/** Reject a pending (or approved) review — it stays, hidden. */
export async function rejectReviewAction(
  _prevState: ReviewActionState | null,
  formData: FormData,
): Promise<ReviewActionState> {
  return updateReviewStatus(formData, "rejected");
}

/**
 * Delete a review — hard delete, the row is removed for good.
 * This cannot be undone: the UI asks for confirmation first.
 */
export async function deleteReviewAction(
  _prevState: ReviewActionState | null,
  formData: FormData,
): Promise<ReviewActionState> {
  await requireAdmin();
  const parsed = reviewIdSchema.safeParse({
    reviewId: formData.get("review_id"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the review and try again.",
    };
  }
  const supabase = await adminClient();
  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", parsed.data.reviewId);
  if (error) {
    return {
      ok: false,
      message: "The review couldn't be deleted. Please try again.",
    };
  }
  revalidatePath("/admin/reviews");
  return {
    ok: true,
    message: "Review deleted — it can't be recovered.",
  };
}
