import AdminLayout from "@/app/admin/(protected)/layout";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin layout tests (S-6 follow-up — Date.now() unstable-value errors).
 *
 * The layout is the first thing that renders for every /admin page:
 * it calls requireAdmin(), which reads the session with
 * supabase.auth.getUser(), and @supabase/auth-js checks the token
 * expiry with Date.now() on every such call. Next 16 (Cache
 * Components) patches the global Date during prerendering and flags
 * every Date.now() as an unstable value — so the layout must call
 * await connection() BEFORE requireAdmin(), or every /admin request
 * logs "Route ... encountered the unstable value `Date.now()` while
 * prerendering" (the pages still render, Next falls back to a dynamic
 * render after aborting the shell). These tests lock in that order:
 * connection() is invoked before requireAdmin().
 */

const { connectionMock, requireAdminMock } = vi.hoisted(() => ({
  connectionMock: vi.fn(async () => undefined),
  requireAdminMock: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("next/server", () => ({
  connection: connectionMock,
}));

vi.mock("@/app/admin/(protected)/admin-data", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the admin nav and its children", async () => {
    render(await AdminLayout({ children: <p>Child content</p> }));

    expect(screen.getByText("Child content")).toBeInTheDocument();
    expect(screen.getByText("RabbY Admin")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/admin");
    expect(
      screen.getByRole("link", { name: "Settings" }),
    ).toHaveAttribute("href", "/admin/settings");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("calls connection() before requireAdmin()", async () => {
    render(await AdminLayout({ children: <p>Child content</p> }));

    expect(connectionMock).toHaveBeenCalled();
    expect(requireAdminMock).toHaveBeenCalled();
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireAdminMock.mock.invocationCallOrder[0],
    );
  });
});
