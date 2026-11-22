import ForgotPasswordForm from "@/components/admin/forgot-password-form";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock("@/components/admin/password-reset-actions", () => ({
  requestPasswordResetAction: requestMock,
}));

/**
 * Forgot-password form tests (S-6 follow-up) — the server action
 * is mocked; no network, no Supabase.
 */
describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMock.mockReset();
  });

  it("renders the email field and the send button", () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/admin/login");
  });

  it("shows the same inbox message after sending the link", async () => {
    requestMock.mockResolvedValue({ ok: true });
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(
      screen.getByText(/a password reset link has been sent/i),
    ).toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledWith("owner@example.com");
  });

  it("shows a plain-words error when the request fails", async () => {
    requestMock.mockResolvedValue({
      ok: false,
      error: "Enter a valid email address.",
    });
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Check your inbox")).not.toBeInTheDocument();
  });

  it("shows the generic error when the action throws", async () => {
    requestMock.mockRejectedValue(new Error("boom"));
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
  });
});
