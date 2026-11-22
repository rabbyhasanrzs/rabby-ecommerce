import ResetPasswordForm from "@/components/admin/reset-password-form";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resetMock } = vi.hoisted(() => ({
  resetMock: vi.fn(),
}));

vi.mock("@/components/admin/password-reset-actions", () => ({
  resetPasswordAction: resetMock,
}));

/**
 * A faithful NEXT_REDIRECT-shaped error: a successful password
 * change ends in redirect("/admin/login?reset=1"), and the throw
 * lands in the form's catch. Message and digest match what
 * Next.js produces (see next/dist/client/components/redirect-error.js).
 */
function redirectError(): Error {
  const error = new Error("NEXT_REDIRECT");
  (error as { digest?: string }).digest =
    "NEXT_REDIRECT;replace;/admin/login?reset=1;307;";
  return error;
}

/**
 * Reset-password form tests (S-6 follow-up) — the server action
 * is mocked; no network, no Supabase.
 */
describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMock.mockReset();
  });

  function fillPasswords(newPassword: string, confirmPassword: string) {
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: newPassword },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: confirmPassword },
    });
  }

  it("renders both password fields with eye toggles", () => {
    render(<ResetPasswordForm />);

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show new password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show confirm new password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change password" }),
    ).toBeInTheDocument();
  });

  it("shows an error and does not call the action on mismatched passwords", () => {
    render(<ResetPasswordForm />);

    fillPasswords("new-secret-123", "different");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("shows no error when the password change redirects (success)", async () => {
    resetMock.mockRejectedValue(redirectError());
    render(<ResetPasswordForm />);

    fillPasswords("new-secret-123", "new-secret-123");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Change password" }),
      ).toBeEnabled();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(resetMock).toHaveBeenCalledWith(
      "new-secret-123",
      "new-secret-123",
    );
  });

  it("shows the plain-words error when the action fails", async () => {
    resetMock.mockResolvedValue({
      ok: false,
      error: "That password is too short. Use a longer one.",
    });
    render(<ResetPasswordForm />);

    fillPasswords("abc", "abc");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("That password is too short. Use a longer one."),
    ).toBeInTheDocument();
  });

  it("shows and hides each password field with its own eye toggle", () => {
    render(<ResetPasswordForm />);

    const newPasswordInput = screen.getByLabelText("New password");
    fireEvent.change(newPasswordInput, { target: { value: "secret-123" } });

    fireEvent.click(
      screen.getByRole("button", { name: "Show new password" }),
    );
    expect(newPasswordInput).toHaveAttribute("type", "text");
    expect(newPasswordInput).toHaveValue("secret-123");
    expect(
      screen.getByRole("button", { name: "Hide new password" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Hide new password" }),
    );
    expect(newPasswordInput).toHaveAttribute("type", "password");
    expect(newPasswordInput).toHaveValue("secret-123");
  });
});
