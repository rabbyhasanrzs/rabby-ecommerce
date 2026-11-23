import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Privacy Policy + Terms (S-5, T-54)", () => {
  it("labels the Privacy Policy as a draft and covers checkout data only", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { name: "Privacy Policy" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Draft — owner to confirm final text"),
    ).toHaveLength(1);
    expect(
      screen.getByText(/Draft — owner to confirm final text\. This is plain-language draft content/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/guest-checkout shop — there is no account or login/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Card details are never collected on this site/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sends you an order-confirmation email and emails when your order status changes/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/to the email address you gave at checkout/),
    ).toBeInTheDocument();
  });

  it("labels the Terms as a draft and states BDT, demo config and the returns proposal", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", { name: "Terms & Conditions" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Draft — owner to confirm final text"),
    ).toHaveLength(1);
    expect(
      screen.getByText(/Draft — owner to confirm final text\. This is plain-language draft content/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All prices are in Bangladeshi Taka \(৳\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/demo configuration values, not final prices/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Proposed default: you can return or exchange within 7 days/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cancel before the Shipped step/),
    ).toBeInTheDocument();
  });
});
