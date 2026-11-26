import SiteFooter from "@/components/site-footer";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("SiteFooter finish (S-5)", () => {
  it("has the 4 groups — Shop, Help, About, Contact", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("navigation", { name: "Shop" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Help" })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "About" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contact" }),
    ).toBeInTheDocument();
  });

  it("links the real categories — Men, Women, Polarized — to the filtered listing", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Men" })).toHaveAttribute(
      "href",
      "/sunglasses?category=men",
    );
    expect(screen.getByRole("link", { name: "Women" })).toHaveAttribute(
      "href",
      "/sunglasses?category=women",
    );
    expect(screen.getByRole("link", { name: "Polarized" })).toHaveAttribute(
      "href",
      "/sunglasses?category=polarized",
    );
    expect(
      screen.getByRole("link", { name: "All Sunglasses" }),
    ).toHaveAttribute("href", "/sunglasses");
  });

  it("links the Lens Guide next to the Face-Shape Guide", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Lens Guide" })).toHaveAttribute(
      "href",
      "/guide/lens",
    );
    expect(
      screen.getByRole("link", { name: "Face-Shape Guide" }),
    ).toHaveAttribute("href", "/guide/face-shape");
  });

  it("shows the payment methods as text only, with no payment logos", () => {
    render(<SiteFooter />);

    expect(
      screen.getByText(
        /Payment methods: Cash on Delivery · bKash · Nagad · Rocket · Online Payment \(Cards, bKash, Nagad, Rocket & more\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Online Payment Gateway|demo configuration/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("has NO social links — only the 'links coming soon' wording", () => {
    render(<SiteFooter />);

    expect(screen.getByText(/links coming soon/)).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).not.toMatch(
        /facebook\.com|instagram\.com|x\.com|twitter\.com/,
      );
    }
  });

  it("keeps the contact group as a labelled demo placeholder — no invented details", () => {
    render(<SiteFooter />);

    expect(screen.getByText(/demo placeholder/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Contact page" }),
    ).toHaveAttribute("href", "/contact");
  });

  it("copyright uses the current year", () => {
    render(<SiteFooter />);

    expect(
      screen.getByText(new RegExp(`©.*${new Date().getFullYear()}`)),
    ).toBeInTheDocument();
  });
});
