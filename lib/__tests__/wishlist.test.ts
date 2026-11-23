import {
  initialWishlistState,
  parseStoredWishlist,
  wishlistCount,
  wishlistReducer,
  type WishlistState,
} from "@/lib/wishlist";
import { describe, expect, it } from "vitest";

describe("wishlistReducer", () => {
  it("adds a slug, in save order", () => {
    const next = wishlistReducer(initialWishlistState, {
      type: "add",
      slug: "sample-round-a",
    });
    expect(next.slugs).toEqual(["sample-round-a"]);
    expect(next.loaded).toBe(false);
  });

  it("adding the same slug twice saves it once", () => {
    const once = wishlistReducer(
      { slugs: ["sample-round-a"], loaded: true },
      { type: "add", slug: "sample-round-a" },
    );
    expect(once.slugs).toEqual(["sample-round-a"]);
  });

  it("removes a slug and leaves the rest", () => {
    const start: WishlistState = {
      slugs: ["sample-round-a", "sample-aviator-a"],
      loaded: true,
    };
    const next = wishlistReducer(start, {
      type: "remove",
      slug: "sample-round-a",
    });
    expect(next.slugs).toEqual(["sample-aviator-a"]);
  });

  it("toggle adds when absent and removes when present", () => {
    const added = wishlistReducer(initialWishlistState, {
      type: "toggle",
      slug: "sample-round-a",
    });
    expect(added.slugs).toEqual(["sample-round-a"]);
    const removed = wishlistReducer(added, {
      type: "toggle",
      slug: "sample-round-a",
    });
    expect(removed.slugs).toEqual([]);
  });

  it("ignores an invalid slug — it can never be a product", () => {
    const next = wishlistReducer(initialWishlistState, {
      type: "add",
      slug: "NOT A SLUG!",
    });
    expect(next.slugs).toEqual([]);
    const toggled = wishlistReducer(initialWishlistState, {
      type: "toggle",
      slug: "UPPERCASE",
    });
    expect(toggled.slugs).toEqual([]);
  });

  it("load replaces the list and marks it loaded", () => {
    const next = wishlistReducer(initialWishlistState, {
      type: "load",
      slugs: ["sample-round-a", "sample-aviator-a"],
    });
    expect(next).toEqual({
      slugs: ["sample-round-a", "sample-aviator-a"],
      loaded: true,
    });
  });

  it("clear empties the list but keeps the loaded flag", () => {
    const next = wishlistReducer(
      { slugs: ["sample-round-a"], loaded: true },
      { type: "clear" },
    );
    expect(next).toEqual({ slugs: [], loaded: true });
  });
});

describe("parseStoredWishlist", () => {
  it("keeps valid slugs in order, de-duplicated", () => {
    expect(
      parseStoredWishlist([
        "sample-round-a",
        "sample-aviator-a",
        "sample-round-a",
      ]),
    ).toEqual(["sample-round-a", "sample-aviator-a"]);
  });

  it("drops non-string entries and invalid slugs", () => {
    expect(
      parseStoredWishlist([
        "sample-round-a",
        42,
        null,
        "NOT A SLUG!",
        "sample-aviator-a",
      ]),
    ).toEqual(["sample-round-a", "sample-aviator-a"]);
  });

  it("returns [] for corrupt or wrong-shape stored data", () => {
    expect(parseStoredWishlist(null)).toEqual([]);
    expect(parseStoredWishlist("sample-round-a")).toEqual([]);
    expect(parseStoredWishlist({ slug: "sample-round-a" })).toEqual([]);
    expect(parseStoredWishlist(undefined)).toEqual([]);
  });
});

describe("wishlistCount", () => {
  it("counts saved slugs", () => {
    expect(
      wishlistCount({ slugs: ["a", "b"], loaded: true }),
    ).toBe(2);
    expect(wishlistCount(initialWishlistState)).toBe(0);
  });
});
