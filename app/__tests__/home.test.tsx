import Home from "@/app/page";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Home page (S-0 placeholder)", () => {
  it("labels every section as placeholder demo content", () => {
    render(<Home />);

    expect(
      screen.getAllByText("Placeholder — demo content, not real products"),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole("heading", { name: "Placeholder hero" }),
    ).toBeInTheDocument();
  });

  it("shows the approved 3-item trust strip", () => {
    render(<Home />);

    expect(screen.getByText("Secure Payment")).toBeInTheDocument();
    expect(screen.getByText("Quality Assurance")).toBeInTheDocument();
    expect(screen.getByText("Customer Support")).toBeInTheDocument();
  });

  it("links to the sunglasses listing", () => {
    render(<Home />);

    expect(
      screen.getByRole("link", { name: "Shop sunglasses" }),
    ).toHaveAttribute("href", "/sunglasses");
  });
});
