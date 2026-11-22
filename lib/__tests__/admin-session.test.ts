import {
  ADMIN_SESSION_ABSOLUTE_HOURS,
  ADMIN_SESSION_ABSOLUTE_MS,
  ADMIN_SESSION_IDLE_MINUTES,
  ADMIN_SESSION_IDLE_MS,
  buildAdminSessionValue,
  checkSessionTimeout,
  getSessionTimeoutKind,
  getSessionTimeoutMessage,
  parseAdminSessionValue,
  refreshAdminSessionValue,
  serializeAdminSessionValue,
} from "@/lib/admin-session";
import { describe, expect, it } from "vitest";

/**
 * Admin session timeout (S-6 follow-up, D-S6-1) — pure-function
 * tests. Timing is covered here with fixed clocks, never with real
 * waits: 30 minutes idle, 8 hours absolute.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe("admin session timeout constants", () => {
  it("is 30 minutes idle and 8 hours absolute", () => {
    expect(ADMIN_SESSION_IDLE_MINUTES).toBe(30);
    expect(ADMIN_SESSION_ABSOLUTE_HOURS).toBe(8);
    expect(ADMIN_SESSION_IDLE_MS).toBe(30 * MINUTE_MS);
    expect(ADMIN_SESSION_ABSOLUTE_MS).toBe(8 * HOUR_MS);
  });
});

describe("checkSessionTimeout idle boundary", () => {
  it("is ok at 29:59 without activity and expired at 30:00", () => {
    const start = 1_000_000_000_000;
    const value = serializeAdminSessionValue(
      buildAdminSessionValue(start),
    );
    expect(checkSessionTimeout(value, start + 29 * MINUTE_MS + 59_000)).toBe(
      "ok",
    );
    expect(checkSessionTimeout(value, start + 30 * MINUTE_MS)).toBe("idle");
  });

  it("stays ok while activity keeps refreshing last-activity", () => {
    const start = 1_000_000_000_000;
    // Active 20 minutes ago, 50 minutes after sign-in: idle is fine.
    const value = serializeAdminSessionValue({
      s: start,
      a: start + 30 * MINUTE_MS,
    });
    expect(
      checkSessionTimeout(value, start + 50 * MINUTE_MS),
    ).toBe("ok");
  });
});

describe("checkSessionTimeout absolute boundary", () => {
  it("is ok at 7:59 after sign-in and expired at 8:00 even if active", () => {
    const start = 1_000_000_000_000;
    // Active one minute ago, so the idle limit is nowhere near hit.
    const activeAt759 = serializeAdminSessionValue({
      s: start,
      a: start + 7 * HOUR_MS + 58 * MINUTE_MS,
    });
    expect(
      checkSessionTimeout(activeAt759, start + 7 * HOUR_MS + 59 * MINUTE_MS),
    ).toBe("ok");
    const activeAt800 = serializeAdminSessionValue({
      s: start,
      a: start + 8 * HOUR_MS - MINUTE_MS,
    });
    expect(checkSessionTimeout(activeAt800, start + 8 * HOUR_MS)).toBe(
      "absolute",
    );
  });

  it("reports absolute when both limits are hit", () => {
    const start = 1_000_000_000_000;
    const value = serializeAdminSessionValue({ s: start, a: start });
    expect(
      checkSessionTimeout(value, start + 9 * HOUR_MS),
    ).toBe("absolute");
  });
});

describe("admin session cookie build/parse round-trip", () => {
  it("round-trips start and last-activity through the cookie value", () => {
    const now = 1_777_000_000_000;
    const built = buildAdminSessionValue(now);
    expect(built).toEqual({ s: now, a: now });
    const raw = serializeAdminSessionValue(built);
    expect(parseAdminSessionValue(raw)).toEqual({ s: now, a: now });
    expect(checkSessionTimeout(raw, now)).toBe("ok");
  });

  it("keeps the sign-in time and moves last-activity on refresh", () => {
    const start = 1_000_000_000_000;
    const raw = serializeAdminSessionValue({ s: start, a: start });
    const refreshed = refreshAdminSessionValue(raw, start + 10 * MINUTE_MS);
    expect(refreshed).not.toBeNull();
    expect(parseAdminSessionValue(refreshed)).toEqual({
      s: start,
      a: start + 10 * MINUTE_MS,
    });
  });
});

describe("missing and malformed session values", () => {
  it("parses missing and malformed values as null", () => {
    expect(parseAdminSessionValue(null)).toBeNull();
    expect(parseAdminSessionValue(undefined)).toBeNull();
    expect(parseAdminSessionValue("")).toBeNull();
    expect(parseAdminSessionValue("not-json")).toBeNull();
    expect(parseAdminSessionValue("{}")).toBeNull();
    expect(parseAdminSessionValue('{"s":1}')).toBeNull();
    expect(parseAdminSessionValue('{"s":"x","a":1}')).toBeNull();
    // Sign-in after last-activity is not a shape we ever write.
    expect(parseAdminSessionValue('{"s":2000,"a":1000}')).toBeNull();
  });

  it("treats a missing or malformed value as idle-expired (fail closed)", () => {
    const now = 1_000_000_000_000;
    expect(checkSessionTimeout(null, now)).toBe("idle");
    expect(checkSessionTimeout(undefined, now)).toBe("idle");
    expect(checkSessionTimeout("garbage", now)).toBe("idle");
    expect(refreshAdminSessionValue("garbage", now)).toBeNull();
  });
});

describe("getSessionTimeoutMessage", () => {
  it("returns the plain-words message for each kind and null otherwise", () => {
    expect(getSessionTimeoutMessage("idle")).toBe(
      "Your session ended after 30 minutes without activity. Please sign in again.",
    );
    expect(getSessionTimeoutMessage("absolute")).toBe(
      "Your session ended after 8 hours. Please sign in again.",
    );
    expect(getSessionTimeoutMessage("bogus")).toBeNull();
    expect(getSessionTimeoutMessage(null)).toBeNull();
    expect(getSessionTimeoutMessage(undefined)).toBeNull();
  });
});

describe("getSessionTimeoutKind", () => {
  it("reads the session kind out of a 401 JSON body", () => {
    expect(getSessionTimeoutKind({ session: "idle" })).toBe("idle");
    expect(getSessionTimeoutKind({ session: "absolute" })).toBe("absolute");
  });

  it("returns null for anything that is not a timeout body", () => {
    expect(getSessionTimeoutKind({ ok: false })).toBeNull();
    expect(getSessionTimeoutKind({ session: "bogus" })).toBeNull();
    expect(getSessionTimeoutKind(null)).toBeNull();
    expect(getSessionTimeoutKind("idle")).toBeNull();
  });
});
