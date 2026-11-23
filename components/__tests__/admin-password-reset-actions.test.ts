import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/components/admin/password-reset-actions";
import { __resetRateLimits } from "@/lib/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resetPasswordForEmailMock,
  updateUserMock,
  signOutMock,
  rpcMock,
  createAdminClientMock,
  createPasswordResetClientMock,
  mockRequestState,
} = vi.hoisted(() => ({
  resetPasswordForEmailMock: vi.fn(),
  updateUserMock: vi.fn(),
  signOutMock: vi.fn(),
  rpcMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  createPasswordResetClientMock: vi.fn(),
  mockRequestState: {
    ip: "203.0.113.7",
    host: "rabby-ecommerce-staging.vercel.app",
    proto: "https",
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
  // The reset client is synchronous (plain supabase-js client, no
  // cookies) — mockReturnValue, not mockResolvedValue.
  createPasswordResetClient: createPasswordResetClientMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockImplementation(async () => ({
    get: (name: string) => {
      if (name === "x-forwarded-for") return mockRequestState.ip;
      if (name === "host") return mockRequestState.host;
      if (name === "x-forwarded-proto") return mockRequestState.proto;
      return null;
    },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

/**
 * Admin password-reset actions (S-6 follow-up) — mocked Supabase,
 * real in-memory limiter. No network.
 */
describe("requestPasswordResetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
    mockRequestState.ip = "203.0.113.7";
    mockRequestState.host = "rabby-ecommerce-staging.vercel.app";
    mockRequestState.proto = "https";
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
    rpcMock.mockResolvedValue({ data: true, error: null });
    updateUserMock.mockResolvedValue({ data: {}, error: null });
    signOutMock.mockResolvedValue({ error: null });
    createPasswordResetClientMock.mockReturnValue({
      auth: {
        resetPasswordForEmail: resetPasswordForEmailMock,
        updateUser: updateUserMock,
        signOut: signOutMock,
      },
      rpc: rpcMock,
    });
  });

  it("rejects an empty email without calling Supabase", async () => {
    const result = await requestPasswordResetAction("   ");
    expect(result).toEqual({
      ok: false,
      error: "Enter a valid email address.",
    });
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("rejects an email without an @ without calling Supabase", async () => {
    const result = await requestPasswordResetAction("not-an-email");
    expect(result).toEqual({
      ok: false,
      error: "Enter a valid email address.",
    });
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("sends the reset link back to the deployment the request came from", async () => {
    const result = await requestPasswordResetAction("owner@example.com");
    expect(result).toEqual({ ok: true });
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
      "owner@example.com",
      {
        redirectTo:
          "https://rabby-ecommerce-staging.vercel.app/auth/callback?next=/admin/reset-password",
      },
    );
  });

  it("sends the reset email through the implicit-flow client, not the PKCE admin client", async () => {
    await requestPasswordResetAction("owner@example.com");
    expect(createPasswordResetClientMock).toHaveBeenCalledTimes(1);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns the generic error when Supabase fails", async () => {
    resetPasswordForEmailMock.mockResolvedValue({
      data: null,
      error: { message: "mail service down" },
    });
    const result = await requestPasswordResetAction("owner@example.com");
    expect(result).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
  });

  it("returns the rate-limit message after 10 requests from the same IP", async () => {
    for (let i = 0; i < 10; i++) {
      const result = await requestPasswordResetAction("owner@example.com");
      expect(result).toEqual({ ok: true });
    }
    expect(resetPasswordForEmailMock).toHaveBeenCalledTimes(10);

    // The 11th attempt never reaches Supabase.
    const limited = await requestPasswordResetAction("owner@example.com");
    expect(limited).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
    expect(resetPasswordForEmailMock).toHaveBeenCalledTimes(10);
  });
});

describe("resetPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimits();
    rpcMock.mockResolvedValue({ data: true, error: null });
    updateUserMock.mockResolvedValue({ data: {}, error: null });
    signOutMock.mockResolvedValue({ error: null });
    createAdminClientMock.mockResolvedValue({
      auth: {
        resetPasswordForEmail: resetPasswordForEmailMock,
        updateUser: updateUserMock,
        signOut: signOutMock,
      },
      rpc: rpcMock,
    });
  });

  it("rejects mismatched passwords without calling Supabase", async () => {
    const result = await resetPasswordAction("new-secret-123", "different");
    expect(result).toEqual({
      ok: false,
      error: "Passwords do not match.",
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("rejects an empty password without calling Supabase", async () => {
    const result = await resetPasswordAction("", "");
    expect(result).toEqual({
      ok: false,
      error: "Enter your new password twice.",
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("signs a non-admin out and fails closed", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    const result = await resetPasswordAction("new-secret-123", "new-secret-123");
    expect(result).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalled();
  });

  it("changes the password, signs out, and redirects to the login page", async () => {
    await expect(
      resetPasswordAction("new-secret-123", "new-secret-123"),
    ).rejects.toThrow("REDIRECT:/admin/login?reset=1");
    expect(updateUserMock).toHaveBeenCalledWith({
      password: "new-secret-123",
    });
    expect(signOutMock).toHaveBeenCalled();
  });

  it("explains a too-short password in plain words", async () => {
    updateUserMock.mockResolvedValue({
      data: null,
      error: { message: "Password should be at least 6 characters." },
    });
    const result = await resetPasswordAction("abc", "abc");
    expect(result).toEqual({
      ok: false,
      error: "That password is too short. Use a longer one.",
    });
  });

  it("returns the generic error for other update failures", async () => {
    updateUserMock.mockResolvedValue({
      data: null,
      error: { message: "network down" },
    });
    const result = await resetPasswordAction("new-secret-123", "new-secret-123");
    expect(result).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
  });
});
