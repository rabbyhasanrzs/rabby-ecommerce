import HelpFaq from "@/components/help-faq";
import HelpPage from "@/app/help/page";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Help / FAQ (S-5, T-50)", () => {
  it("renders the heading and the five category chips", () => {
    render(<HelpPage />);

    expect(
      screen.getByRole("heading", { name: "Help & FAQ" }),
    ).toBeInTheDocument();
    for (const chip of ["Delivery", "Payment", "Returns", "Stock", "Fit"]) {
      expect(
        screen.getByRole("button", { name: chip }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "All questions" }),
    ).toBeInTheDocument();
  });

  it("shows delivery, payment, returns, stock and fit questions by default", () => {
    render(<HelpFaq />);

    expect(
      screen.getByRole("button", {
        name: "How much is delivery, and how long does it take?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Which payment methods can I use?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "What is the returns policy?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "What does “Only 1 left in stock” mean?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "How do I choose a frame for my face shape?",
      }),
    ).toBeInTheDocument();
  });

  it("states the demo delivery fees and tax, and labels them demo", () => {
    render(<HelpFaq />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "How much is delivery, and how long does it take?",
      }),
    );
    expect(screen.getByText(/Inside Dhaka: ৳60, 1–2 days/)).toBeInTheDocument();
    expect(screen.getByText(/Outside Dhaka: ৳120, 3–5 days/)).toBeInTheDocument();
    expect(screen.getByText(/demo configuration values/)).toBeInTheDocument();
  });

  it("states the 7-day returns proposal and the cancel-before-Shipped rule", () => {
    render(<HelpFaq />);

    fireEvent.click(
      screen.getByRole("button", { name: "What is the returns policy?" }),
    );
    expect(
      screen.getByText(/within 7 days of delivery/),
    ).toBeInTheDocument();
    expect(screen.getByText(/proposed default, not final policy/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Can I cancel my order?" }),
    );
    expect(screen.getByText(/before the Shipped step/)).toBeInTheDocument();
    expect(screen.getByText(/back into stock/)).toBeInTheDocument();
  });

  it("filtering by a category hides other topics' questions", () => {
    render(<HelpFaq />);

    fireEvent.click(screen.getByRole("button", { name: "Payment" }));

    expect(
      screen.getByRole("button", {
        name: "Which payment methods can I use?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "How much is delivery, and how long does it take?",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "What is the returns policy?",
      }),
    ).not.toBeInTheDocument();
  });

  it("opens one accordion at a time, with aria-expanded announced", () => {
    render(<HelpFaq />);

    const delivery = screen.getByRole("button", {
      name: "How much is delivery, and how long does it take?",
    });
    const payment = screen.getByRole("button", {
      name: "Which payment methods can I use?",
    });

    expect(delivery).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(delivery);
    expect(delivery).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Inside Dhaka: ৳60/)).toBeInTheDocument();

    fireEvent.click(payment);
    expect(payment).toHaveAttribute("aria-expanded", "true");
    expect(delivery).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Inside Dhaka: ৳60/)).not.toBeInTheDocument();

    fireEvent.click(payment);
    expect(payment).toHaveAttribute("aria-expanded", "false");
  });

  it("links to /contact for still-needing-help", () => {
    render(<HelpFaq />);

    expect(screen.getByRole("link", { name: "Contact us" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });
});
