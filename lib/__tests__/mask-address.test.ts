import { maskDeliveryAddress } from "@/lib/mask-address";
import { describe, expect, it } from "vitest";

describe("maskDeliveryAddress", () => {
  it("masks the detailed part and keeps area + city visible", () => {
    expect(maskDeliveryAddress("House 12, Road 5, Dhanmondi, Dhaka")).toBe(
      "•••, Dhanmondi, Dhaka",
    );
  });

  it("collapses several hidden segments into one marker", () => {
    expect(
      maskDeliveryAddress("Flat 4B, House 12, Road 5, Dhanmondi, Dhaka"),
    ).toBe("•••, Dhanmondi, Dhaka");
  });

  it("masks a single-segment address entirely", () => {
    expect(maskDeliveryAddress("Dhanmondi")).toBe("•••");
  });

  it("masks the first segment of a two-segment address", () => {
    expect(maskDeliveryAddress("Dhanmondi, Dhaka")).toBe("•••, Dhaka");
  });

  it("returns an empty string for empty or blank input", () => {
    expect(maskDeliveryAddress("")).toBe("");
    expect(maskDeliveryAddress("   ")).toBe("");
    expect(maskDeliveryAddress(" , , ")).toBe("");
  });

  it("trims extra whitespace around segments", () => {
    expect(
      maskDeliveryAddress("  House 12 , Road 5 , Dhanmondi , Dhaka  "),
    ).toBe("•••, Dhanmondi, Dhaka");
  });

  it("ignores empty segments from stray commas", () => {
    expect(maskDeliveryAddress("House 12,, Dhanmondi, Dhaka")).toBe(
      "•••, Dhanmondi, Dhaka",
    );
  });

  it("keeps the city visible even when only the city is detailed", () => {
    // The last two segments (area + city) are never masked: the zone
    // and city part of the address always stays visible.
    expect(maskDeliveryAddress("House 12, Dhanmondi, Dhaka")).toBe(
      "•••, Dhanmondi, Dhaka",
    );
    expect(maskDeliveryAddress("Road 5, Dhaka")).toBe("•••, Dhaka");
  });
});
