import MfaEnrollment from "@/components/admin/mfa-enrollment";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  challengeMock,
  verifyMock,
  unenrollMock,
  listFactorsMock,
  getUserMock,
} = vi.hoisted(() => ({
  challengeMock: vi.fn(),
  verifyMock: vi.fn(),
  unenrollMock: vi.fn(),
  listFactorsMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase/browser-client", () => ({
  createBrowserClient: () => ({
    auth: {
      getUser: getUserMock,
      mfa: {
        listFactors: listFactorsMock,
        challenge: challengeMock,
        verify: verifyMock,
        unenroll: unenrollMock,
      },
    },
  }),
}));

/**
 * MFA enrollment tests (S-6, D-S6-2, Slice B) — the browser client
 * is mocked; no network, no Supabase. Covers the unenroll rule:
 * turning MFA off needs a FRESH code from the authenticator app —
 * a wrong code shows an error and does NOT unenroll; a correct
 * code unenrolls.
 *
 * The component starts in the "enrolled" state: a verified totp
 * factor exists.
 */

function mockEnrolled() {
  getUserMock.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  listFactorsMock.mockResolvedValue({
    data: {
      totp: [{ id: "factor-1", status: "verified" }],
      phone: [],
    },
    error: null,
  });
}

describe("MfaEnrollment unenroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnrolled();
    challengeMock.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    verifyMock.mockResolvedValue({ data: {}, error: null });
    unenrollMock.mockResolvedValue({ data: {}, error: null });
  });

  it("shows a code input next to the turn-off button when enrolled", async () => {
    render(<MfaEnrollment />);

    expect(
      await screen.findByText(
        "Two-factor authentication is on for this admin account. Sign-in asks for a code from your authenticator app.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Code from your authenticator app"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Turn off two-factor authentication",
      }),
    ).toBeInTheDocument();
  });

  it("does NOT unenroll and shows an error on a wrong code", async () => {
    verifyMock.mockResolvedValue({
      data: null,
      error: { message: "invalid code" },
    });
    render(<MfaEnrollment />);

    await screen.findByText(
      "Two-factor authentication is on for this admin account. Sign-in asks for a code from your authenticator app.",
    );
    fireEvent.change(
      screen.getByLabelText("Code from your authenticator app"),
      { target: { value: "000000" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Turn off two-factor authentication",
      }),
    );

    await waitFor(() =>
      expect(screen.getByText("Wrong code. Try again.")).toBeInTheDocument(),
    );
    expect(challengeMock).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(verifyMock).toHaveBeenCalledWith({
      factorId: "factor-1",
      challengeId: "challenge-1",
      code: "000000",
    });
    expect(unenrollMock).not.toHaveBeenCalled();
  });

  it("unenrolls after a correct code and says MFA must be set up again", async () => {
    render(<MfaEnrollment />);

    await screen.findByText(
      "Two-factor authentication is on for this admin account. Sign-in asks for a code from your authenticator app.",
    );
    fireEvent.change(
      screen.getByLabelText("Code from your authenticator app"),
      { target: { value: "123456" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Turn off two-factor authentication",
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Two-factor authentication is off. Set it up again to keep using the admin area — the admin area will ask you to set it up on your next visit.",
        ),
      ).toBeInTheDocument(),
    );
    expect(unenrollMock).toHaveBeenCalledWith({ factorId: "factor-1" });
  });
});
