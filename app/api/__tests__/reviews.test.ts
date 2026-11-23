/**
 * @vitest-environment node
 */
import { POST } from "@/app/api/reviews/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitMock, ReviewSubmitErrorMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  ReviewSubmitErrorMock: class ReviewSubmitError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
}));

/** The route only uses the reviews-module submit wrapper — mock that (not the network). */
vi.mock("@/lib/supabase/reviews", () => ({
  submitReview: submitMock,
  ReviewSubmitError: ReviewSubmitErrorMock,
  SupabaseNotConfiguredError: class SupabaseNotConfiguredError extends Error {},
}));

const IP = "203.0.113.7";

const VALID_BODY = {
  reference: "RB-2026-123456",
  phone: "01712345678",
  productSlug: "sample-round-a",
  rating: 5,
  qualityRating: 5,
  valueRating: null,
  fitRating: null,
  body: "Great fit and very comfortable.",
};

function postReview(body: unknown, ip?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ip) {
    headers["x-forwarded-for"] = ip;
  }
  return POST(
    new Request("http://localhost/api/reviews", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  submitMock.mockResolvedValue({ reviewId: "review-1", status: "pending" });
});

// ---------------------------------------------------------------------------
// POST /api/reviews
// ---------------------------------------------------------------------------

describe("POST /api/reviews", () => {
  it("returns 200 pending on a valid submission", async () => {
    const response = await postReview(VALID_BODY, IP);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "pending" });
    expect(submitMock).toHaveBeenCalledWith({
      reference: "RB-2026-123456",
      phone: "01712345678",
      productSlug: "sample-round-a",
      rating: 5,
      qualityRating: 5,
      valueRating: null,
      fitRating: null,
      body: "Great fit and very comfortable.",
    });
  });

  it("accepts a submission without sub-ratings", async () => {
    const response = await postReview(
      { ...VALID_BODY, qualityRating: undefined },
      IP,
    );
    expect(response.status).toBe(200);
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({ qualityRating: null }),
    );
  });

  it("rejects a bad reference, rating 0 / 6, and an empty body with 400", async () => {
    for (const body of [
      { ...VALID_BODY, reference: "NOT-A-REF" },
      { ...VALID_BODY, rating: 0 },
      { ...VALID_BODY, rating: 6 },
      { ...VALID_BODY, body: "   " },
      { ...VALID_BODY, phone: "123" },
    ]) {
      const response = await postReview(body, IP);
      expect(response.status).toBe(400);
    }
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("passes the submit error's plain-words message through as a 400", async () => {
    submitMock.mockRejectedValue(
      new ReviewSubmitErrorMock(
        "We couldn't find that order. Check the reference and phone number and try again.",
      ),
    );
    const response = await postReview(VALID_BODY, IP);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error:
        "We couldn't find that order. Check the reference and phone number and try again.",
    });
  });

  it("rate-limits after 10 submissions per 10 minutes per IP", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await postReview(VALID_BODY, IP);
      expect(response.status).toBe(200);
    }
    const limited = await postReview(VALID_BODY, IP);
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toMatch(/Too many attempts/);
    // A different IP is unaffected.
    const other = await postReview(VALID_BODY, "198.51.100.9");
    expect(other.status).toBe(200);
  });

  it("does not consume rate-limit budget on malformed requests", async () => {
    for (let i = 0; i < 12; i++) {
      await postReview({ ...VALID_BODY, rating: 0 }, IP);
    }
    const response = await postReview(VALID_BODY, IP);
    expect(response.status).toBe(200);
  });

  it("returns 500 (generic message, no stack) on an unexpected failure", async () => {
    submitMock.mockRejectedValue(new Error("database exploded"));
    const response = await postReview(VALID_BODY, IP);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
  });
});
