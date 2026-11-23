import AdminForgotPasswordPage from "@/app/admin/forgot-password/page";
import AdminLoginPage from "@/app/admin/login/page";
import AdminMfaSetupPage from "@/app/admin/mfa-setup/page";
import AdminResetPasswordPage from "@/app/admin/reset-password/page";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Public admin pages — connection() before the session read
 * (S-6 follow-up — Date.now() unstable-value errors, round 2).
 *
 * PR #34 fixed the protected admin area by calling await
 * connection() before requireAdmin(). The four PUBLIC admin pages
 * (login, forgot-password, reset-password, mfa-setup) were outside
 * that scope and kept the same bug: they read the session with
 * supabase.auth.getUser(), and @supabase/auth-js checks the token
 * expiry with Date.now() on every such call. Next 16 (Cache
 * Components) flags that as an unstable value during prerendering —
 * reproduced locally with a session cookie present:
 * "Route \"/admin/forgot-password\": Next.js encountered the
 * unstable value `Date.now()` while prerendering" (same for login
 * and reset-password). The pages' try/catch cannot prevent it — it
 * swallows the dynamic bailout, so the read still runs during the
 * prerender attempt. These tests lock in the PR #34 fix for these
 * pages: connection() is invoked before the session read.
 */

const {
  connectionMock,
  createAdminClientMock,
  checkAdminAccessMock,
  getAdminUserMock,
} = vi.hoisted(() => ({
  connectionMock: vi.fn(async () => undefined),
  createAdminClientMock: vi.fn(async () => ({})),
  checkAdminAccessMock: vi.fn(async () => ({
    status: "unauthenticated",
    user: null,
  })),
  getAdminUserMock: vi.fn(async () => null),
}));

vi.mock("next/server", () => ({
  connection: connectionMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
  checkAdminAccess: checkAdminAccessMock,
  getAdminUser: getAdminUserMock,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/admin-session", () => ({
  getSessionTimeoutMessage: () => null,
}));

vi.mock("@/components/admin/login-form", () => ({
  default: () => <p>Login form</p>,
}));

vi.mock("@/components/admin/forgot-password-form", () => ({
  default: () => <p>Forgot-password form</p>,
}));

vi.mock("@/components/admin/reset-password-form", () => ({
  default: () => <p>Reset-password form</p>,
}));

vi.mock("@/components/admin/reset-link-handler", () => ({
  default: () => <p>Reset link handler</p>,
}));

vi.mock("@/components/admin/mfa-enrollment", () => ({
  default: () => <p>MFA enrollment</p>,
}));

describe("public admin pages call connection() before the session read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login: connection() before createAdminClient()/checkAdminAccess()", async () => {
    render(
      await AdminLoginPage({ searchParams: Promise.resolve({}) }),
    );

    expect(screen.getByText("Login form")).toBeInTheDocument();
    expect(connectionMock).toHaveBeenCalled();
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(checkAdminAccessMock).toHaveBeenCalled();
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      createAdminClientMock.mock.invocationCallOrder[0],
    );
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      checkAdminAccessMock.mock.invocationCallOrder[0],
    );
  });

  it("forgot-password: connection() before createAdminClient()/checkAdminAccess()", async () => {
    render(await AdminForgotPasswordPage());

    expect(screen.getByText("Forgot-password form")).toBeInTheDocument();
    expect(connectionMock).toHaveBeenCalled();
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(checkAdminAccessMock).toHaveBeenCalled();
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      createAdminClientMock.mock.invocationCallOrder[0],
    );
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      checkAdminAccessMock.mock.invocationCallOrder[0],
    );
  });

  it("reset-password: connection() before createAdminClient()/getAdminUser()", async () => {
    render(await AdminResetPasswordPage());

    expect(screen.getByText("Reset link handler")).toBeInTheDocument();
    expect(connectionMock).toHaveBeenCalled();
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(getAdminUserMock).toHaveBeenCalled();
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      createAdminClientMock.mock.invocationCallOrder[0],
    );
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      getAdminUserMock.mock.invocationCallOrder[0],
    );
  });

  it("mfa-setup: connection() before createAdminClient()/getAdminUser()", async () => {
    await expect(AdminMfaSetupPage()).rejects.toThrow(
      "REDIRECT:/admin/login",
    );

    expect(connectionMock).toHaveBeenCalled();
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(getAdminUserMock).toHaveBeenCalled();
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      createAdminClientMock.mock.invocationCallOrder[0],
    );
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      getAdminUserMock.mock.invocationCallOrder[0],
    );
  });
});
