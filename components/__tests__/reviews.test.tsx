import ReviewsSection from "@/components/reviews";
import type { ReviewAggregate } from "@/lib/supabase/reviews";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * ReviewsSection tests. Fixture data only — clearly labelled test
 * reviews, never real-looking content; no seed rows exist anywhere.
 */

const AGGREGATE: ReviewAggregate = {
  productSlug: "sample-round-a",
  reviewCount: 2,
  averageRating: 4.5,
  breakdown: { "5": 1, "4": 1, "3": 0, "2": 0, "1": 0 },
  qualityAverage: 4.5,
  valueAverage: 4.0,
  fitAverage: 5.0,
  reviews: [
    {
      reviewerName: "Test Buyer One",
      rating: 5,
      qualityRating: 5,
      valueRating: 4,
      fitRating: 5,
      body: "Great fit and very comfortable.",
      createdAt: "2026-11-23T10:00:00Z",
    },
    {
      reviewerName: "Test Buyer Two",
      rating: 4,
      qualityRating: null,
      valueRating: null,
      fitRating: null,
      body: "Good value for money.",
      createdAt: "2026-11-22T10:00:00Z",
    },
  ],
};

const EMPTY: ReviewAggregate = {
  productSlug: "sample-round-a",
  reviewCount: 0,
  averageRating: null,
  breakdown: { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
  qualityAverage: null,
  valueAverage: null,
  fitAverage: null,
  reviews: [],
};

describe("ReviewsSection", () => {
  it("shows the F12 display set: average, count, breakdown, sub-ratings, list", () => {
    render(
      <ReviewsSection
        aggregate={AGGREGATE}
        productSlug="sample-round-a"
        productName="SAMPLE Round A"
        prefilledReference={null}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Reviews" }),
    ).toBeInTheDocument();
    expect(screen.getByText("out of 5")).toBeInTheDocument();
    expect(screen.getByText("Based on 2 reviews")).toBeInTheDocument();
    // Breakdown bars carry their counts as labels.
    expect(
      screen.getByLabelText("1 out of 2 reviews gave 5 stars"),
    ).toBeInTheDocument();
    expect(screen.getByText("Quality")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("Fit")).toBeInTheDocument();
    // The approved reviews, with names + bodies, no phone/reference.
    expect(screen.getByText("Test Buyer One")).toBeInTheDocument();
    expect(
      screen.getByText("Great fit and very comfortable."),
    ).toBeInTheDocument();
    expect(screen.getByText("Test Buyer Two")).toBeInTheDocument();
    expect(screen.getByText("Good value for money.")).toBeInTheDocument();
    expect(screen.queryByText(/0171/)).not.toBeInTheDocument();
    expect(screen.queryByText(/RB-2026/)).not.toBeInTheDocument();
    // The form sits behind a button when reviews exist.
    expect(
      screen.getByRole("button", { name: "Write a review" }),
    ).toBeInTheDocument();
  });

  it("renders NOTHING with zero approved reviews and no invite (the honest empty state)", () => {
    const { container } = render(
      <ReviewsSection
        aggregate={EMPTY}
        productSlug="sample-round-a"
        productName="SAMPLE Round A"
        prefilledReference={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Reviews")).not.toBeInTheDocument();
    expect(screen.queryByText(/No reviews yet/)).not.toBeInTheDocument();
  });

  it("renders only the form (no aggregate) when the buyer arrives with ?ref=", () => {
    render(
      <ReviewsSection
        aggregate={EMPTY}
        productSlug="sample-round-a"
        productName="SAMPLE Round A"
        prefilledReference="RB-2026-123456"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Reviews" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Based on/)).not.toBeInTheDocument();
    expect(
      (screen.getByLabelText("Order reference") as HTMLInputElement).value,
    ).toBe("RB-2026-123456");
  });
});
