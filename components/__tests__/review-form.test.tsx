import ReviewForm from "@/components/review-form";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock;
});

function renderForm(prefilledReference: string | null = null) {
  return render(
    <ReviewForm
      productSlug="sample-round-a"
      productName="SAMPLE Round A"
      prefilledReference={prefilledReference}
      defaultOpen={prefilledReference !== null}
    />,
  );
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Order reference"), {
    target: { value: "RB-2026-123456" },
  });
  fireEvent.change(screen.getByLabelText("Phone number"), {
    target: { value: "01712345678" },
  });
  // The main rating fieldset (the three sub-ratings also have a
  // "5 stars" radio — scope the click to the main rating).
  const ratingFieldset = screen
    .getByText("Your rating for SAMPLE Round A")
    .closest("fieldset");
  if (!ratingFieldset) {
    throw new Error("rating fieldset not found");
  }
  fireEvent.click(within(ratingFieldset).getByLabelText("5 stars"));
  fireEvent.change(screen.getByLabelText("Your review"), {
    target: { value: "Great fit and very comfortable." },
  });
}

describe("ReviewForm", () => {
  it("sits behind a button until opened, then shows the form", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: "Write a review" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Order reference")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Write a review" }));
    expect(screen.getByLabelText("Order reference")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    expect(screen.getByLabelText("Your review")).toBeInTheDocument();
  });

  it("opens expanded with the reference prefilled from the track-order invite", () => {
    renderForm("RB-2026-123456");
    expect(screen.queryByRole("button", { name: "Write a review" })).not.toBeInTheDocument();
    expect(
      (screen.getByLabelText("Order reference") as HTMLInputElement).value,
    ).toBe("RB-2026-123456");
  });

  it("shows plain-words errors for missing reference, rating, and body", () => {
    renderForm("RB-2026-123456");
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    expect(
      screen.getByRole("alert").textContent,
    ).toMatch(/phone number|star rating|few words/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits a valid review and shows the pending-approval message", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, status: "pending" }),
    });
    renderForm("RB-2026-123456");
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() => {
      expect(
        screen.getByRole("status").textContent,
      ).toMatch(/received.*checked and approved/);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reviews",
      expect.objectContaining({ method: "POST" }),
    );
    const sent = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body,
    );
    expect(sent).toEqual({
      reference: "RB-2026-123456",
      phone: "01712345678",
      productSlug: "sample-round-a",
      rating: 5,
      qualityRating: null,
      valueRating: null,
      fitRating: null,
      body: "Great fit and very comfortable.",
    });
  });

  it("shows the server's plain-words error when the submission is rejected", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: false,
        error:
          "We couldn't find that order. Check the reference and phone number and try again.",
      }),
    });
    renderForm("RB-2026-123456");
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /couldn't find that order/,
      );
    });
  });
});
