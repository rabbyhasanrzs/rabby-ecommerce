import WishlistLink from "@/components/wishlist-link";
import { WishlistProvider } from "@/lib/wishlist-context";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

const STORAGE_KEY = "rabby-wishlist-v1";

beforeEach(() => {
  window.localStorage.clear();
});

describe("WishlistLink", () => {
  it("starts at 0 saved and links to /wishlist", async () => {
    render(
      <WishlistProvider>
        <WishlistLink />
      </WishlistProvider>,
    );

    const link = await screen.findByRole("link", {
      name: "Wishlist, 0 saved",
    });
    expect(link).toHaveAttribute("href", "/wishlist");
    expect(screen.getByText("Wishlist")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows the live saved count from storage after mount", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["sample-round-a", "sample-aviator-a"]),
    );
    render(
      <WishlistProvider>
        <WishlistLink />
      </WishlistProvider>,
    );

    expect(
      await screen.findByRole("link", { name: "Wishlist, 2 saved" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
