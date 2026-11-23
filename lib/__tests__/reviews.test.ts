import {
  ReviewSubmitError,
  emptyReviewAggregate,
  parseReviewAggregate,
  submitReview,
} from "@/lib/supabase/reviews";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

/** Reviews only use the anon client + RPCs — mock those, not the network. */
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: rpcMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const AGGREGATE_JSON = {
  product_slug: "sample-round-a",
  review_count: 3,
  average_rating: 4.7,
  breakdown: { "5": 2, "4": 1, "3": 0, "2": 0, "1": 0 },
  quality_average: 4.5,
  value_average: 4.0,
  fit_average: 5.0,
  reviews: [
    {
      reviewer_name: "Test Buyer",
      rating: 5,
      quality_rating: 5,
      value_rating: 4,
      fit_rating: 5,
      body: "Great fit and very comfortable.",
      created_at: "2026-11-23T10:00:00Z",
    },
  ],
};

// ---------------------------------------------------------------------------
// parseReviewAggregate
// ---------------------------------------------------------------------------

describe("parseReviewAggregate", () => {
  it("parses a full aggregate (fixture data, clearly labelled test data)", () => {
    const parsed = parseReviewAggregate(AGGREGATE_JSON);
    expect(parsed).toEqual({
      productSlug: "sample-round-a",
      reviewCount: 3,
      averageRating: 4.7,
      breakdown: { "5": 2, "4": 1, "3": 0, "2": 0, "1": 0 },
      qualityAverage: 4.5,
      valueAverage: 4.0,
      fitAverage: 5.0,
      reviews: [
        {
          reviewerName: "Test Buyer",
          rating: 5,
          qualityRating: 5,
          valueRating: 4,
          fitRating: 5,
          body: "Great fit and very comfortable.",
          createdAt: "2026-11-23T10:00:00Z",
        },
      ],
    });
  });

  it("parses a zero-review aggregate (null averages, empty list)", () => {
    const parsed = parseReviewAggregate({
      product_slug: "sample-round-a",
      review_count: 0,
      average_rating: null,
      breakdown: { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
      quality_average: null,
      value_average: null,
      fit_average: null,
      reviews: [],
    });
    expect(parsed?.reviewCount).toBe(0);
    expect(parsed?.averageRating).toBeNull();
    expect(parsed?.reviews).toEqual([]);
  });

  it("returns null on malformed payloads (never a crash)", () => {
    expect(parseReviewAggregate(null)).toBeNull();
    expect(parseReviewAggregate("not an object")).toBeNull();
    expect(parseReviewAggregate({ ...AGGREGATE_JSON, review_count: -1 })).toBeNull();
    expect(parseReviewAggregate({ ...AGGREGATE_JSON, breakdown: null })).toBeNull();
    expect(
      parseReviewAggregate({ ...AGGREGATE_JSON, reviews: "not an array" }),
    ).toBeNull();
    expect(
      parseReviewAggregate({
        ...AGGREGATE_JSON,
        reviews: [{ reviewer_name: "X", rating: 6, body: "b", created_at: "2026-11-23T10:00:00Z" }],
      }),
    ).toBeNull();
  });
});

describe("emptyReviewAggregate", () => {
  it("returns a zero-review aggregate for the slug", () => {
    expect(emptyReviewAggregate("sample-round-a")).toEqual({
      productSlug: "sample-round-a",
      reviewCount: 0,
      averageRating: null,
      breakdown: { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
      qualityAverage: null,
      valueAverage: null,
      fitAverage: null,
      reviews: [],
    });
  });
});

// ---------------------------------------------------------------------------
// submitReview — error mapping
// ---------------------------------------------------------------------------

const SUBMIT_INPUT = {
  reference: "RB-2026-123456",
  phone: "01712345678",
  productSlug: "sample-round-a",
  rating: 5,
  qualityRating: 5,
  valueRating: null,
  fitRating: null,
  body: "Great fit and very comfortable.",
};

describe("submitReview", () => {
  it("returns the review id + pending status on success", async () => {
    rpcMock.mockResolvedValue({
      data: { review_id: "review-1", status: "pending" },
      error: null,
    });
    await expect(submitReview(SUBMIT_INPUT)).resolves.toEqual({
      reviewId: "review-1",
      status: "pending",
    });
    expect(rpcMock).toHaveBeenCalledWith("submit_review", {
      p_reference: "RB-2026-123456",
      p_phone: "01712345678",
      p_product_slug: "sample-round-a",
      p_rating: 5,
      p_quality_rating: 5,
      p_value_rating: null,
      p_fit_rating: null,
      p_body: "Great fit and very comfortable.",
    });
  });

  it("maps order-not-found, not-delivered, not-in-order, and duplicate to plain-words errors", async () => {
    const cases: Array<[string, string]> = [
      ["review_order_not_found", "We couldn't find that order."],
      [
        "review_order_not_delivered",
        "You can leave a review once your order is delivered.",
      ],
      ["review_product_not_in_order", "That product wasn't in this order."],
      [
        "review_already_submitted",
        "You've already reviewed this product for this order.",
      ],
    ];
    for (const [raised, message] of cases) {
      rpcMock.mockResolvedValue({
        data: null,
        error: { message: raised },
      });
      await expect(submitReview(SUBMIT_INPUT)).rejects.toThrowError(
        expect.objectContaining({
          name: "ReviewSubmitError",
          message: expect.stringContaining(message),
        }),
      );
    }
  });

  it("throws a generic error for anything else (never the raw message)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "something unexpected" },
    });
    let caught: unknown;
    try {
      await submitReview(SUBMIT_INPUT);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ReviewSubmitError);
    expect((caught as Error).message).toBe(
      "Your review couldn't be submitted. Please try again.",
    );
  });
});
