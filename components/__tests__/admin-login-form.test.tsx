import LoginForm from "@/components/admin/login-form";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock, verifyMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  verifyMock: vi.fn(),
}));

vi.mock("@/components/admin/login-actions", () => ({
  signInAction: signInMock,
  verifyMfaAction: verifyMock,
}));

/**
 * Admin login form tests (S-4, T-40) — the server actions are
 * mocked; no network, no Supabase. Covers: rendering, the MFA
 * step appearing when sign-in requires it, and entered values
 * staying in the fields after an error.
 */

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInMock.mockReset();
    verifyMock.mockReset();
  });

  it("renders the email + password fields and the sign-in button", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
  });

  it("shows the initial error (e.g. non-admin redirect) above the form", () => {
    render(<LoginForm initialError="You do not have admin access." />);

    expect(
      screen.getByText("You do not have admin access."),
    ).toBeInTheDocument();
  });

  it("shows the MFA hint when requireAdmin sent the owner back for a fresh code", () => {
    render(<LoginForm mfaHint />);

    expect(
      screen.getByText(
        "Your session needs a fresh verification code. Sign in again.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the entered values and shows a plain-words error on wrong credentials", async () => {
    signInMock.mockResolvedValue({
      ok: false,
      error: "Wrong email or password.",
    });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "not-the-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Wrong email or password."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("owner@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue(
      "not-the-password",
    );
  });

  it("shows the MFA code step when sign-in requires it", async () => {
    signInMock.mockResolvedValue({
      ok: true,
      needsMfa: true,
      factorId: "factor-1",
    });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByLabelText("Verification code"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verify code" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Back to sign in")).toBeInTheDocument();
  });

  it("shows a plain-words error and keeps the code on a wrong MFA code", async () => {
    signInMock.mockResolvedValue({
      ok: true,
      needsMfa: true,
      factorId: "factor-1",
    });
    verifyMock.mockResolvedValue({
      ok: false,
      error: "Wrong code. Try again.",
    });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const codeInput = await screen.findByLabelText("Verification code");
    fireEvent.change(codeInput, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    expect(await screen.findByText("Wrong code. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Verification code")).toHaveValue("000000");
    expect(verifyMock).toHaveBeenCalledWith("factor-1", "000000");
  });

  it("goes back to the credentials step from the MFA step", async () => {
    signInMock.mockResolvedValue({
      ok: true,
      needsMfa: true,
      factorId: "factor-1",
    });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByLabelText("Verification code");
    fireEvent.click(screen.getByText("Back to sign in"));

    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
  });
});
