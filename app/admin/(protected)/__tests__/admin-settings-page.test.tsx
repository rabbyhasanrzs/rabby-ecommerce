import AdminSettingsPage from "@/app/admin/(protected)/settings/page";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin Settings page tests (S-6 follow-up — Date.now() unstable-value
 * errors). This page was one of only two admin pages with no
 * connection() call: requireAdmin() reads the session with
 * supabase.auth.getUser(), and @supabase/auth-js checks the token
 * expiry with Date.now() on every such call, which Next 16 (Cache
 * Components) flags as an unstable value during prerendering. The
 * page must call await connection() BEFORE requireAdmin().
 */

const { connectionMock, requireAdminMock } = vi.hoisted(() => ({
  connectionMock: vi.fn(async () => undefined),
  requireAdminMock: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("next/server", () => ({
  connection: connectionMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: requireAdminMock,
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        order: async () => ({ data: [], error: null }),
      }),
    }),
  }),
}));

vi.mock("@/lib/site-settings", () => ({
  getSiteSettings: async () => ({
    taxRatePercent: 5,
    deliveryInsideFeeBdt: 60,
    deliveryInsideEstimate: "1–2 days",
    deliveryOutsideFeeBdt: 120,
    deliveryOutsideEstimate: "3–5 days",
    paymentCodEnabled: true,
    paymentBkashEnabled: true,
    paymentNagadEnabled: true,
    paymentRocketEnabled: true,
    paymentCardEnabled: true,
    paymentOnlineEnabled: false,
    websiteNotice: "",
    supportWhatsapp: "",
    supportMessenger: "",
    supportPhone: "",
    supportEmail: "",
  }),
}));

vi.mock("@/components/admin/settings-form", () => ({
  default: () => <div>Settings form stub</div>,
}));

vi.mock("@/components/admin/mfa-enrollment", () => ({
  default: () => <div>MFA stub</div>,
}));

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the settings heading and form", async () => {
    render(await AdminSettingsPage());

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Settings form stub")).toBeInTheDocument();
    expect(screen.getByText("MFA stub")).toBeInTheDocument();
  });

  it("calls connection() before requireAdmin()", async () => {
    render(await AdminSettingsPage());

    expect(connectionMock).toHaveBeenCalled();
    expect(requireAdminMock).toHaveBeenCalled();
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireAdminMock.mock.invocationCallOrder[0],
    );
  });
});
