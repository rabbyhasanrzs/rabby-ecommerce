import {
  checkAdminAccess,
  requireAdmin,
} from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

/**
 * Admin auth tests (S-4, T-40) — mocked clients, no network.
 *
 * checkAdminAccess() is the pure, testable core: session -> admin
 * role (am_i_admin RPC) -> MFA. requireAdmin() wraps it with the
 * real redirects; here the mocked redirect throws, which is what
 * the tests assert on.
 */

interface MockClientOptions {
  user?: { id: string; email?: string } | null;
  getUserError?: boolean;
  isAdmin?: boolean | null;
  adminError?: boolean;
  totpFactors?: { id: string; status: string }[];
  currentLevel?: string | null;
  mfaError?: boolean;
}

function mockClient(options: MockClientOptions = {}): SupabaseClient {
  const {
    user = { id: "user-1", email: "owner@example.com" },
    getUserError = false,
    isAdmin = true,
    adminError = false,
    totpFactors = [],
    currentLevel = "aal1",
    mfaError = false,
  } = options;
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: getUserError ? null : user },
        error: getUserError ? { message: "no session" } : null,
      }),
      mfa: {
        listFactors: vi.fn().mockResolvedValue(
          mfaError
            ? { data: null, error: { message: "mfa unavailable" } }
            : {
                data: { totp: totpFactors, phone: [] },
                error: null,
              },
        ),
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue(
          mfaError
            ? { data: null, error: { message: "mfa unavailable" } }
            : {
                data: { currentLevel, nextLevel: "aal2" },
                error: null,
              },
        ),
      },
    },
    rpc: vi.fn().mockImplementation((name: string) => {
      if (name === "am_i_admin") {
        return Promise.resolve({
          data: adminError ? null : isAdmin,
          error: adminError ? { message: "rpc failed" } : null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  } as unknown as SupabaseClient;
}

describe("checkAdminAccess", () => {
  it("returns unauthenticated when there is no session", async () => {
    const access = await checkAdminAccess(mockClient({ user: null }));
    expect(access.status).toBe("unauthenticated");
    expect(access.user).toBeNull();
  });

  it("returns unauthenticated when getUser errors", async () => {
    const access = await checkAdminAccess(
      mockClient({ getUserError: true }),
    );
    expect(access.status).toBe("unauthenticated");
  });

  it("returns forbidden when the user is not an admin", async () => {
    const access = await checkAdminAccess(mockClient({ isAdmin: false }));
    expect(access.status).toBe("forbidden");
    expect(access.user).toBeNull();
  });

  it("returns forbidden (fail closed) when the am_i_admin RPC errors", async () => {
    const access = await checkAdminAccess(mockClient({ adminError: true }));
    expect(access.status).toBe("forbidden");
  });

  it("returns mfa-missing for an admin with no enrolled MFA factor (D-S6-2: MFA is mandatory)", async () => {
    const access = await checkAdminAccess(mockClient({}));
    expect(access.status).toBe("mfa-missing");
    expect(access.user).toBeNull();
  });

  it("returns mfa-required for an admin with a verified totp factor at aal1", async () => {
    const access = await checkAdminAccess(
      mockClient({
        totpFactors: [{ id: "factor-1", status: "verified" }],
        currentLevel: "aal1",
      }),
    );
    expect(access.status).toBe("mfa-required");
  });

  it("returns ok for an admin with a verified totp factor already at aal2 (the owner's enrolled account keeps working)", async () => {
    const access = await checkAdminAccess(
      mockClient({
        totpFactors: [{ id: "factor-1", status: "verified" }],
        currentLevel: "aal2",
      }),
    );
    expect(access.status).toBe("ok");
  });

  it("treats unverified totp factors as not enrolled (mfa-missing)", async () => {
    const access = await checkAdminAccess(
      mockClient({
        totpFactors: [{ id: "factor-1", status: "unverified" }],
        currentLevel: "aal1",
      }),
    );
    expect(access.status).toBe("mfa-missing");
  });

  it("fails CLOSED (mfa-required) when MFA status cannot be read", async () => {
    const access = await checkAdminAccess(
      mockClient({
        totpFactors: [{ id: "factor-1", status: "verified" }],
        mfaError: true,
      }),
    );
    expect(access.status).toBe("mfa-required");
    expect(access.user).toBeNull();
  });

  it("fails CLOSED (mfa-required) when MFA status cannot be read for a factor-less admin too", async () => {
    const access = await checkAdminAccess(mockClient({ mfaError: true }));
    expect(access.status).toBe("mfa-required");
    expect(access.user).toBeNull();
  });
});

describe("requireAdmin", () => {
  it("redirects a logged-out visitor to /admin/login", async () => {
    await expect(
      requireAdmin(mockClient({ user: null })),
    ).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("redirects an authenticated non-admin to /admin/login?error=forbidden", async () => {
    await expect(
      requireAdmin(mockClient({ isAdmin: false })),
    ).rejects.toThrow("REDIRECT:/admin/login?error=forbidden");
  });

  it("redirects an admin at aal1 with enrolled MFA to /admin/login?mfa=1", async () => {
    await expect(
      requireAdmin(
        mockClient({
          totpFactors: [{ id: "factor-1", status: "verified" }],
          currentLevel: "aal1",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/admin/login?mfa=1");
  });

  it("redirects an admin with no enrolled MFA factor to /admin/mfa-setup?required=1", async () => {
    await expect(requireAdmin(mockClient({}))).rejects.toThrow(
      "REDIRECT:/admin/mfa-setup?required=1",
    );
  });

  it("redirects to /admin/login?mfa=1 (fail closed) when MFA status cannot be read", async () => {
    await expect(
      requireAdmin(mockClient({ mfaError: true })),
    ).rejects.toThrow("REDIRECT:/admin/login?mfa=1");
  });

  it("returns the user for a fully verified admin (verified factor at aal2)", async () => {
    const user = await requireAdmin(
      mockClient({
        totpFactors: [{ id: "factor-1", status: "verified" }],
        currentLevel: "aal2",
      }),
    );
    expect(user.id).toBe("user-1");
  });

  it("redirects to /admin/login when Supabase is not configured", async () => {
    // No client passed and no env vars: this is the CI-build case
    // (a prerender with no Supabase config) — it must redirect like
    // a logged-out visit, not throw "Supabase is not configured".
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      await expect(requireAdmin()).rejects.toThrow(
        "REDIRECT:/admin/login",
      );
    } finally {
      if (savedUrl !== undefined)
        process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
      if (savedKey !== undefined)
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey;
    }
  });
});
