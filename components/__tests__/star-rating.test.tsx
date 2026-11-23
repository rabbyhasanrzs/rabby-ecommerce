import { StarsDisplay, StarsInput } from "@/components/star-rating";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// StarsDisplay
// ---------------------------------------------------------------------------

describe("StarsDisplay", () => {
  it("labels the average + count in plain words and clips the gold row to the average", () => {
    render(<StarsDisplay average={4.7} count={12} />);
    const img = screen.getByRole("img", {
      name: "Rated 4.7 out of 5 stars, based on 12 reviews",
    });
    expect(img).toBeInTheDocument();
    // 4.7 / 5 = 94% gold.
    const clip = img.querySelector("span.absolute");
    expect(clip).not.toBeNull();
    expect((clip as HTMLElement).style.width).toBe("94%");
    // Five background stars + five foreground stars.
    expect(img.querySelectorAll("svg").length).toBe(10);
  });

  it("uses the singular 'review' for a count of 1", () => {
    render(<StarsDisplay average={5} count={1} />);
    expect(
      screen.getByRole("img", {
        name: "Rated 5.0 out of 5 stars, based on 1 review",
      }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// StarsInput
// ---------------------------------------------------------------------------

describe("StarsInput", () => {
  it("renders five star radios and reports the chosen value", () => {
    const onChange = vi.fn();
    render(
      <StarsInput
        id="test-rating"
        label="Your rating"
        value={0}
        onChange={onChange}
        required
      />,
    );
    expect(screen.getByText("Your rating")).toBeInTheDocument();
    for (const star of [1, 2, 3, 4, 5]) {
      expect(
        screen.getByLabelText(`${star} star${star === 1 ? "" : "s"}`),
      ).toBeInTheDocument();
    }
    fireEvent.click(screen.getByLabelText("4 stars"));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("marks the chosen star as checked", () => {
    render(
      <StarsInput
        id="test-rating"
        label="Your rating"
        value={3}
        onChange={vi.fn()}
        required
      />,
    );
    expect(
      (screen.getByLabelText("3 stars") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("4 stars") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("marks optional sub-ratings as optional (no required star)", () => {
    render(
      <StarsInput
        id="test-quality"
        label="Quality"
        value={0}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Quality")).toBeInTheDocument();
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });
});
