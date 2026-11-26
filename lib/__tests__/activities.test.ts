import {
  ACTIVITIES,
  activityLabel,
  activitySchema,
  isActivitySlug,
} from "@/lib/activities";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Shop by Activity — S-7 (F17, 1.x-6): the docs' four activities.
// ---------------------------------------------------------------------------

describe("activitySchema", () => {
  it("accepts the four approved slugs", () => {
    for (const slug of ["driving", "sport", "beach", "everyday"]) {
      expect(activitySchema.safeParse(slug).success).toBe(true);
    }
  });

  it("rejects anything else — activities are never invented", () => {
    for (const slug of ["golf", "Driving", "driving ", "", "party"]) {
      expect(activitySchema.safeParse(slug).success).toBe(false);
    }
  });
});

describe("ACTIVITIES", () => {
  it("lists the four activities in the docs' order", () => {
    expect(ACTIVITIES.map((activity) => activity.slug)).toEqual([
      "driving",
      "sport",
      "beach",
      "everyday",
    ]);
  });

  it("has a plain-words label for every slug", () => {
    expect(ACTIVITIES.map((activity) => activity.label)).toEqual([
      "Driving",
      "Sport",
      "Beach",
      "Everyday",
    ]);
  });
});

describe("activityLabel", () => {
  it("maps a slug to its plain-words label", () => {
    expect(activityLabel("driving")).toBe("Driving");
    expect(activityLabel("everyday")).toBe("Everyday");
  });

  it("passes an unknown slug through unchanged", () => {
    expect(activityLabel("golf")).toBe("golf");
  });
});

describe("isActivitySlug", () => {
  it("is true only for the four approved slugs", () => {
    expect(isActivitySlug("beach")).toBe(true);
    expect(isActivitySlug("golf")).toBe(false);
    expect(isActivitySlug("")).toBe(false);
  });
});
