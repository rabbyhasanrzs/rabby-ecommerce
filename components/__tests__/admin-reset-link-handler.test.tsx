import ResetLinkHandler from "@/components/admin/reset-link-handler";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock, setSessionMock, createBrowserClientMock } = vi.hoisted(
  () => ({
    replaceMock: vi.fn(),
    setSessionMock: vi.fn(),
    createBrowserClientMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/supabase/browser-client", () => ({
  createBrowserClient: createBrowserClientMock,
}));

/**
 * Reset-link handler tests (S-6 follow-up) — the browser client
 * is mocked; no network, no Supabase, no real tokens. The hash is
 * set with history.replaceState before each render, the way the
 * browser holds it when the reset page loads.
 */
describe("ResetLinkHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceMock.mockReset();
    setSessionMock.mockReset();
    createBrowserClientMock.mockReset();
    createBrowserClientMock.mockReturnValue({
      auth: { setSession: setSessionMock },
    });
    window.history.replaceState(null, "", "/admin/reset-password");
  });

  function setHash(hash: string) {
    window.history.replaceState(null, "", `/admin/reset-password${hash}`);
  }

  it("shows a checking state while the hash is read", () => {
    setSessionMock.mockResolvedValue({ data: {}, error: null });
    setHash("#access_token=tok&refresh_token=ref");

    render(<ResetLinkHandler />);

    expect(
      screen.getByText("Checking your reset link…"),
    ).toBeInTheDocument();
  });

  it("sets the session from hash tokens and navigates to the plain reset page", async () => {
    setSessionMock.mockResolvedValue({ data: {}, error: null });
    setHash("#access_token=tok&refresh_token=ref");

    render(<ResetLinkHandler />);

    await waitFor(() => {
      expect(setSessionMock).toHaveBeenCalledWith({
        access_token: "tok",
        refresh_token: "ref",
      });
      expect(replaceMock).toHaveBeenCalledWith("/admin/reset-password");
    });
    expect(
      screen.queryByText("This reset link is not valid"),
    ).not.toBeInTheDocument();
  });

  it("shows the invalid-link message when setSession fails", async () => {
    setSessionMock.mockResolvedValue({
      data: {},
      error: { message: "Token has expired" },
    });
    setHash("#access_token=tok&refresh_token=ref");

    render(<ResetLinkHandler />);

    expect(
      await screen.findByText("This reset link is not valid"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "It may have expired or already been used. Request a new one and open it promptly.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request a new reset link" }),
    ).toHaveAttribute("href", "/admin/forgot-password");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("shows the invalid-link message when the hash has no tokens", async () => {
    render(<ResetLinkHandler />);

    expect(
      await screen.findByText("This reset link is not valid"),
    ).toBeInTheDocument();
    expect(setSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("shows the invalid-link message when the hash carries an error", async () => {
    setHash("#error=access_denied&error_description=Expired");

    render(<ResetLinkHandler />);

    expect(
      await screen.findByText("This reset link is not valid"),
    ).toBeInTheDocument();
    expect(setSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
