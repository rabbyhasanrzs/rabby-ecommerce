import {
  signInAction,
  verifyMfaAction,
} from "@/components/admin/login-actions";
import { __resetRateLimits } from "@/lib/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  signInWithPasswordMock,
  signOutMock,
  challengeMock,
  verifyMock,
  mockIpState,
} = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
  challengeMock: vi.fn(),
  verifyMock: vi.fn(),
  mockIpState: { ip: "203.0.113.7" },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signOut: signOutMock,
      mfa: {
        challenge: challengeMock,
        verify: verifyMock,
      },
    },
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockImplementation(async () => ({
    get: (name: string) =>
      name === "x-forwarded-for" ? mockIpState.ip : null,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

/**
 * Admin sign-in rate limiting (S-6, T-61, S6-05) — mocked Supabase,
 * real in-memory limiter. No network.
 */
describe("admin sign-in rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
    mockIpState.ip = "203.0.113.7";
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });
    challengeMock.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    verifyMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid code" },
    });
  });

  function signInForm(): FormData {
    const form = new FormData();
    form.set("email", "owner@example.com");
    form.set("password", "wrong-password");
    return form;
  }

  it("returns the rate-limit message after 10 failed sign-ins from the same IP", async () => {
    for (let i = 0; i < 10; i++) {
      const result = await signInAction(signInForm());
      expect(result).toEqual({
        ok: false,
        error: "Wrong email or password.",
      });
    }
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(10);

    // The 11th attempt never reaches Supabase.
    const limited = await signInAction(signInForm());
    expect(limited).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(10);
  });

  it("gives a different IP a fresh sign-in budget", async () => {
    for (let i = 0; i < 10; i++) {
      await signInAction(signInForm());
    }
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(10);

    mockIpState.ip = "198.51.100.42";
    const result = await signInAction(signInForm());
    expect(result).toEqual({
      ok: false,
      error: "Wrong email or password.",
    });
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(11);
  });

  it("returns the rate-limit message after 10 failed MFA verifications from the same IP", async () => {
    for (let i = 0; i < 10; i++) {
      const result = await verifyMfaAction("factor-1", "000000");
      expect(result).toEqual({
        ok: false,
        error: "Wrong code. Try again.",
      });
    }
    expect(verifyMock).toHaveBeenCalledTimes(10);

    // The 11th attempt never reaches Supabase.
    const limited = await verifyMfaAction("factor-1", "000000");
    expect(limited).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
    expect(verifyMock).toHaveBeenCalledTimes(10);
  });

  it("does not consume budget for an empty sign-in submission", async () => {
    const empty = new FormData();
    const result = await signInAction(empty);
    expect(result).toEqual({
      ok: false,
      error: "Wrong email or password.",
    });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();

    // A full attempt still works after the empty one.
    const next = await signInAction(signInForm());
    expect(next).toEqual({
      ok: false,
      error: "Wrong email or password.",
    });
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);
  });
});
