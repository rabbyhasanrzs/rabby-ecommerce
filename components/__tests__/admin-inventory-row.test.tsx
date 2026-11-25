import InventoryRow from "@/components/admin/inventory-row";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, fetchMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

/**
 * Inventory row tests (S-6 follow-up — the 2026-11-22 inventory
 * bug): a failed save showed only "Something went wrong. Please try
 * again." A 401 must now send the admin back to sign in (with the
 * right next step for a timeout or an MFA code), and a non-JSON
 * answer must do the same instead of showing the mystery error.
 */
function renderRow(waitingCount = 0) {
  return render(
    <table>
      <tbody>
        <InventoryRow
          productId="123e4567-e89b-12d3-a456-426614174000"
          productName="SAMPLE Futuristic A"
          colour="Black"
          stockTotal={0}
          waitingCount={waitingCount}
        />
      </tbody>
    </table>,
  );
}

function setStockAndSave(value: string) {
  fireEvent.change(screen.getByLabelText("Stock for SAMPLE Futuristic A"), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("InventoryRow save errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows Saved on success", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200));
    renderRow();
    setStockAndSave("10");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Saved"),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("redirects to login with the session kind on a timeout 401", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: false, error: "Your session ended.", session: "idle" },
        401,
      ),
    );
    renderRow();
    setStockAndSave("10");
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/admin/login?session=idle"),
    );
    expect(
      screen.queryByText("Something went wrong. Please try again."),
    ).not.toBeInTheDocument();
  });

  it("redirects to login with the MFA step on an mfa-required 401", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          error: "Two-factor authentication is required.",
          code: "mfa-required",
        },
        401,
      ),
    );
    renderRow();
    setStockAndSave("10");
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/admin/login?mfa=1"),
    );
  });

  it("redirects to login on a non-JSON answer instead of the mystery error", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html><body>sign in</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    renderRow();
    setStockAndSave("10");
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/admin/login"),
    );
    expect(
      screen.queryByText("Something went wrong. Please try again."),
    ).not.toBeInTheDocument();
  });

  it("shows the server error on a 500 without redirecting", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: false, error: "Something went wrong. Please try again." },
        500,
      ),
    );
    renderRow();
    setStockAndSave("10");
    await waitFor(() =>
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("InventoryRow waiting count (S-7 back-in-stock)", () => {
  it("shows a dash when nobody is waiting", () => {
    const { container } = renderRow(0);
    expect(container.querySelector("td:nth-child(4)")).toHaveTextContent(
      "—",
    );
  });

  it("shows the pending subscriber count when people are waiting", () => {
    const { container } = renderRow(3);
    expect(container.querySelector("td:nth-child(4)")).toHaveTextContent(
      "3",
    );
  });
});
