import { AdminReviewsPageContent } from "@/app/admin/(protected)/reviews/page";
import {
  approveReviewAction,
  deleteReviewAction,
  rejectReviewAction,
} from "@/app/admin/(protected)/reviews/actions";
import ReviewModerationButtons from "@/components/admin/review-moderation-buttons";
import { requireAdmin } from "@/lib/supabase/admin";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateEqMock, deleteEqMock, revalidateMock, listMock } = vi.hoisted(
  () => ({
    updateEqMock: vi.fn(),
    deleteEqMock: vi.fn(),
    revalidateMock: vi.fn(),
    listMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  createAdminClient: () => ({
    from: () => ({
      update: () => ({ eq: updateEqMock }),
      delete: () => ({ eq: deleteEqMock }),
    }),
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidateMock(...args),
}));

vi.mock("@/app/admin/(protected)/admin-data", () => ({
  adminListReviews: listMock,
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined),
}));

const REVIEW_ID = "123e4567-e89b-12d3-a456-426614174000";

function formDataWithId(id: string): FormData {
  const formData = new FormData();
  formData.set("review_id", id);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateEqMock.mockResolvedValue({ error: null });
  deleteEqMock.mockResolvedValue({ error: null });
});

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

describe("approveReviewAction / rejectReviewAction", () => {
  it("approves a review and revalidates the queue", async () => {
    const result = await approveReviewAction(
      null,
      formDataWithId(REVIEW_ID),
    );
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/approved/);
    expect(updateEqMock).toHaveBeenCalledWith("id", REVIEW_ID);
    expect(revalidateMock).toHaveBeenCalledWith("/admin/reviews");
  });

  it("rejects a review (kept, hidden — never deleted)", async () => {
    const result = await rejectReviewAction(null, formDataWithId(REVIEW_ID));
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/rejected/);
    expect(revalidateMock).toHaveBeenCalledWith("/admin/reviews");
  });

  it("rejects an invalid review id without touching the database", async () => {
    const result = await approveReviewAction(null, formDataWithId("not-a-uuid"));
    expect(result.ok).toBe(false);
    expect(updateEqMock).not.toHaveBeenCalled();
  });

  it("returns a plain-words error when the update fails", async () => {
    updateEqMock.mockResolvedValue({ error: { message: "boom" } });
    const result = await approveReviewAction(null, formDataWithId(REVIEW_ID));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/couldn't be updated/);
  });
});

// ---------------------------------------------------------------------------
// Server action: delete (hard delete — permanent, owner-approved)
// ---------------------------------------------------------------------------

describe("deleteReviewAction", () => {
  it("deletes the review row and revalidates the queue", async () => {
    const result = await deleteReviewAction(null, formDataWithId(REVIEW_ID));
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/deleted/);
    expect(deleteEqMock).toHaveBeenCalledWith("id", REVIEW_ID);
    expect(updateEqMock).not.toHaveBeenCalled();
    expect(revalidateMock).toHaveBeenCalledWith("/admin/reviews");
  });

  it("rejects an invalid review id without touching the database", async () => {
    const result = await deleteReviewAction(null, formDataWithId("not-a-uuid"));
    expect(result.ok).toBe(false);
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("returns a plain-words error when the delete fails", async () => {
    deleteEqMock.mockResolvedValue({ error: { message: "boom" } });
    const result = await deleteReviewAction(null, formDataWithId(REVIEW_ID));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/couldn't be deleted/);
  });

  it("never reaches the database when the admin gate rejects", async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(
      deleteReviewAction(null, formDataWithId(REVIEW_ID)),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(deleteEqMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Delete button: two-step inline confirm
// ---------------------------------------------------------------------------

describe("ReviewModerationButtons delete confirm", () => {
  it("shows Delete for an approved review, and asks before deleting", async () => {
    render(
      <ReviewModerationButtons reviewId={REVIEW_ID} status="approved" />,
    );
    expect(
      screen.getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/can't be undone/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.getByText("Delete this review? This can't be undone."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Yes, delete" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
    // Arming the confirm does not delete anything yet.
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("Cancel disarms the confirm without deleting", () => {
    render(
      <ReviewModerationButtons reviewId={REVIEW_ID} status="pending" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByText(/can't be undone/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("confirming deletes the review", async () => {
    render(
      <ReviewModerationButtons reviewId={REVIEW_ID} status="rejected" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => {
      expect(deleteEqMock).toHaveBeenCalledWith("id", REVIEW_ID);
    });
  });
});

// ---------------------------------------------------------------------------
// Moderation queue page
// ---------------------------------------------------------------------------

const REVIEW_FIXTURES = [
  {
    id: "review-pending",
    product_id: "product-1",
    product_name: "SAMPLE Round A",
    product_slug: "sample-round-a",
    order_reference: "RB-2026-123456",
    reviewer_name: "Test Buyer",
    rating: 5,
    quality_rating: 5,
    value_rating: 4,
    fit_rating: 5,
    body: "Great fit and very comfortable.",
    status: "pending",
    created_at: "2026-11-23T10:00:00Z",
  },
  {
    id: "review-approved",
    product_id: "product-1",
    product_name: "SAMPLE Round A",
    product_slug: "sample-round-a",
    order_reference: "RB-2026-654321",
    reviewer_name: "Test Buyer Two",
    rating: 4,
    quality_rating: null,
    value_rating: null,
    fit_rating: null,
    body: "Good value for money.",
    status: "approved",
    created_at: "2026-11-22T10:00:00Z",
  },
];

describe("AdminReviewsPageContent", () => {
  it("lists pending first with product, reviewer, stars, body, and order link", async () => {
    listMock.mockResolvedValue(REVIEW_FIXTURES);
    render(
      await AdminReviewsPageContent({ searchParams: Promise.resolve({}) }),
    );
    expect(screen.getByRole("heading", { name: "Reviews" })).toBeInTheDocument();
    expect(screen.getByText("Test Buyer")).toBeInTheDocument();
    expect(
      screen.getByText("Great fit and very comfortable."),
    ).toBeInTheDocument();
    expect(screen.getByText("Test Buyer Two")).toBeInTheDocument();
    expect(screen.getByText("Order RB-2026-123456")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Reject" })).toHaveLength(2);
    // Delete is offered on every row, whatever its status.
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
  });

  it("shows an empty-queue message when there are no reviews", async () => {
    listMock.mockResolvedValue([]);
    render(
      await AdminReviewsPageContent({ searchParams: Promise.resolve({}) }),
    );
    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
  });
});
