import WishlistButton from "@/components/wishlist-button";
import { WishlistProvider } from "@/lib/wishlist-context";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

const STORAGE_KEY = "rabby-wishlist-v1";

beforeEach(() => {
  window.localStorage.clear();
});

function storedSlugs(): string[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

describe("WishlistButton", () => {
  it("card variant: toggles save state, persists the slug, and never navigates", async () => {
    const { container } = render(
      <WishlistProvider>
        <WishlistButton
          slug="sample-round-a"
          productName="SAMPLE Round A"
          variant="card"
        />
      </WishlistProvider>,
    );

    const button = screen.getByRole("button", {
      name: "Save SAMPLE Round A to wishlist",
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
    // The button is not inside a link — activating it cannot navigate.
    expect(button.closest("a")).toBeNull();
    expect(container.querySelector("a")).toBeNull();

    fireEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Remove SAMPLE Round A from wishlist",
        }),
      ).toHaveAttribute("aria-pressed", "true");
    });
    expect(storedSlugs()).toEqual(["sample-round-a"]);

    // Clicking again removes it.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove SAMPLE Round A from wishlist",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Save SAMPLE Round A to wishlist",
        }),
      ).toHaveAttribute("aria-pressed", "false");
    });
    expect(storedSlugs()).toEqual([]);
  });

  it("card variant: a saved slug renders filled/saved after mount", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["sample-round-a"]),
    );
    render(
      <WishlistProvider>
        <WishlistButton
          slug="sample-round-a"
          productName="SAMPLE Round A"
          variant="card"
        />
      </WishlistProvider>,
    );

    expect(
      await screen.findByRole("button", {
        name: "Remove SAMPLE Round A from wishlist",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("pdp variant: shows the saved state in words beside Add to Bag", async () => {
    render(
      <WishlistProvider>
        <WishlistButton
          slug="sample-round-a"
          productName="SAMPLE Round A"
          variant="pdp"
        />
      </WishlistProvider>,
    );

    const button = screen.getByRole("button", {
      name: "Save SAMPLE Round A to wishlist",
    });
    expect(button).toHaveTextContent("Save to wishlist");

    fireEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Remove SAMPLE Round A from wishlist",
        }),
      ).toHaveTextContent("Saved to wishlist");
    });
  });

  it("ignores corrupt stored data instead of crashing", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    render(
      <WishlistProvider>
        <WishlistButton
          slug="sample-round-a"
          productName="SAMPLE Round A"
          variant="card"
        />
      </WishlistProvider>,
    );

    expect(
      await screen.findByRole("button", {
        name: "Save SAMPLE Round A to wishlist",
      }),
    ).toBeInTheDocument();
  });
});
