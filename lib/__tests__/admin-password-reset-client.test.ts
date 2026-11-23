import {
  createAdminClient,
  createPasswordResetClient,
} from "@/lib/supabase/admin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

/**
 * flowType is a protected property on GoTrueClient — readable at
 * runtime (verified directly against the installed SDK), but
 * TypeScript blocks direct access, so the tests read it through
 * this narrow cast.
 */
function authFlowType(client: { auth: unknown }): string {
  return (client.auth as unknown as { flowType: string }).flowType;
}

/**
 * Password-reset client (S-6 follow-up) — the reset email must go
 * out through an IMPLICIT-flow client, because @supabase/ssr's
 * createServerClient hard-codes flowType "pkce" (verified against
 * the installed code: the option is spread BEFORE the hard-coded
 * value, so passing auth.flowType is silently ignored) and PKCE
 * needs the code verifier stored in the requesting browser's
 * cookies — but the owner opens the emailed link in his mail app's
 * in-app browser, a different cookie jar. No network: creating a
 * client is lazy.
 */
describe("createPasswordResetClient", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
    if (originalAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
  });

  it("builds a client with the implicit flow (no PKCE verifier)", () => {
    const client = createPasswordResetClient();
    expect(authFlowType(client)).toBe("implicit");
  });

  it("throws when Supabase is not configured", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => createPasswordResetClient()).toThrow(
      "Supabase is not configured",
    );
  });

  it("leaves the shared admin client on PKCE (sign-in / MFA unchanged)", async () => {
    const client = await createAdminClient();
    expect(authFlowType(client)).toBe("pkce");
  });
});
