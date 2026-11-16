import PlaceholderPage from "@/components/placeholder-page";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("PlaceholderPage", () => {
  it("renders the title and the placeholder label", () => {
    render(
      <PlaceholderPage
        title="Test page"
        description="Test description."
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Test page" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Placeholder — demo content, not real products"),
    ).toBeInTheDocument();
    expect(screen.getByText("Test description.")).toBeInTheDocument();
  });
});
