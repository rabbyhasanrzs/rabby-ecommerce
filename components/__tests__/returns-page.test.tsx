import ReturnsPage from "@/app/returns/page";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Returns & Exchange (S-5, T-51)", () => {
  it("states the 7-day proposed default and the plain steps", () => {
    render(<ReturnsPage />);

    expect(
      screen.getByRole("heading", { name: "Returns & Exchange" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Return or exchange within 7 days of delivery/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/proposed default, not final policy/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/unused and undamaged/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/in their original packaging\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "How to return or exchange, step by step",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Check the sunglasses as soon as they arrive/),
    ).toBeInTheDocument();
    // No "Exchange within 24 hours" — that was never an approved fact.
    expect(screen.queryByText(/within 24 hours/)).not.toBeInTheDocument();
  });

  it("covers what cannot be returned and cancelling, and points to /contact", () => {
    render(<ReturnsPage />);

    expect(
      screen.getByRole("heading", { name: "What cannot be returned" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cancel your order before it ships/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "contact us" }),
    ).toHaveAttribute("href", "/contact");
    // No channel-opening button — channels are unconfirmed.
    expect(
      screen.queryByRole("button", { name: /start an exchange/i }),
    ).not.toBeInTheDocument();
  });
});
