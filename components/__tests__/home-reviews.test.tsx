import HomeReviews from "@/components/home-reviews";
import { getRecentApprovedReviews } from "@/lib/supabase/reviews";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedGetRecentApprovedReviews } = vi.hoisted(() => ({
  mockedGetRecentApprovedReviews: vi.fn(),
}));

vi.mock("@/lib/supabase/reviews", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/supabase/reviews")>();
  return {
    ...actual,
    getRecentApprovedReviews: mockedGetRecentApprovedReviews,
  };
});

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

const mockedGetRecent = vi.mocked(getRecentApprovedReviews);

/**
 * Fixture reviews — clearly labelled test data, never real-looking
 * content; no seed rows exist anywhere. Names are full order names
 * here so the test can prove the component shows FIRST names only.
 */
const FIXTURE_REVIEWS = [
  {
    productSlug: "sample-round-a",
    productName: "Sample Round A",
    reviewerName: "Test Buyer",
    rating: 5,
    body: "Great fit and very comfortable.",
    createdAt: "2026-11-23T10:00:00Z",
  },
  {
    productSlug: "sample-aviator-a",
    productName: "Sample Aviator A",
    reviewerName: "Another Buyer",
    rating: 4,
    body: "Good value for the price.",
    createdAt: "2026-11-22T10:00:00Z",
  },
  {
    productSlug: "sample-wayfarer-a",
    productName: "Sample Wayfarer A",
    reviewerName: "Third Buyer",
    rating: 5,
    body: "Light and sturdy, love them.",
    createdAt: "2026-11-21T10:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetRecent.mockResolvedValue(FIXTURE_REVIEWS);
});

describe("HomeReviews (S-7 home-page reviews)", () => {
  it("shows the latest 3 approved reviews — stars, text, product link, first name + Verified Buyer", async () => {
    const { container } = render(await HomeReviews());

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "What our customers say",
      }),
    ).toBeInTheDocument();
    expect(mockedGetRecent).toHaveBeenCalledTimes(1);
    expect(mockedGetRecent).toHaveBeenCalledWith(3);

    // Stars: one labelled star row per card (two 5-star, one 4-star).
    expect(
      screen.getAllByLabelText("Rated 5.0 out of 5 stars"),
    ).toHaveLength(2);
    expect(
      screen.getByLabelText("Rated 4.0 out of 5 stars"),
    ).toBeInTheDocument();

    // Review text, exactly as written.
    expect(
      screen.getByText("Great fit and very comfortable."),
    ).toBeInTheDocument();
    expect(screen.getByText("Good value for the price.")).toBeInTheDocument();

    // Product names link to their PDPs.
    expect(screen.getByRole("link", { name: "Sample Round A" })).toHaveAttribute(
      "href",
      "/product/sample-round-a",
    );
    expect(
      screen.getByRole("link", { name: "Sample Aviator A" }),
    ).toHaveAttribute("href", "/product/sample-aviator-a");

    // First name only — the full order name never appears.
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("Another")).toBeInTheDocument();
    expect(screen.queryByText("Test Buyer")).not.toBeInTheDocument();
    expect(screen.queryByText("Another Buyer")).not.toBeInTheDocument();

    // One Verified Buyer badge per card.
    expect(screen.getAllByText("Verified Buyer")).toHaveLength(3);

    // No phone, email, or order reference anywhere.
    expect(container.textContent).not.toMatch(/01\d{9}|@|RB-2026/);
  });

  it("renders NOTHING with zero approved reviews (the honest empty state)", async () => {
    mockedGetRecent.mockResolvedValue([]);
    const { container } = render(await HomeReviews());

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("heading", { name: "What our customers say" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/No reviews yet/)).not.toBeInTheDocument();
  });

  it("renders NOTHING when the reviews read fails (never breaks the home page)", async () => {
    mockedGetRecent.mockRejectedValue(new Error("Reviews could not be loaded."));
    const { container } = render(await HomeReviews());

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("heading", { name: "What our customers say" }),
    ).not.toBeInTheDocument();
  });
});
