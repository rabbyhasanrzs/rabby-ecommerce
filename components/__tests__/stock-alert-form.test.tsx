import StockAlertForm from "@/components/stock-alert-form";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

/**
 * Stock alert form tests (S-7 back-in-stock).
 *
 * The form is one purpose, one field: the email is the only
 * identity (guest-first, no accounts). A successful subscribe —
 * new or already-subscribed, the server answers both with one
 * shared message — hides the form and shows the subscribed state.
 * An invalid email gets the exact message the checkout form
 * already uses.
 */
function renderForm() {
  return render(
    <StockAlertForm
      productSlug="sample-futuristic"
      productName="SAMPLE Futuristic A"
    />,
  );
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("StockAlertForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("states the one purpose on the form", () => {
    renderForm();
    expect(
      screen.getByText(
        "We'll email you only when this product is back in stock.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Email address for stock alerts on SAMPLE Futuristic A"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Notify me" }),
    ).toBeInTheDocument();
  });

  it("shows the subscribed state on success and hides the form", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: true, message: "We'll email you when this is back in stock." },
        200,
      ),
    );
    renderForm();
    fireEvent.change(
      screen.getByLabelText(
        "Email address for stock alerts on SAMPLE Futuristic A",
      ),
      { target: { value: "customer@example.com" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Notify me" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "We'll email you when this is back in stock.",
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Notify me" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stock-alerts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          productSlug: "sample-futuristic",
          email: "customer@example.com",
        }),
      }),
    );
  });

  it("shows the server error without hiding the form", async () => {
    // A valid email that the server rejects (e.g. the product came
    // back in stock meanwhile) — the form stays, with the plain
    // message. A malformed email never reaches the handler: the
    // native email input blocks the submit in the browser, and the
    // route test covers the server-side 400 for it.
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: false, error: "This product is in stock now — you can order it." },
        400,
      ),
    );
    renderForm();
    fireEvent.change(
      screen.getByLabelText(
        "Email address for stock alerts on SAMPLE Futuristic A",
      ),
      { target: { value: "customer@example.com" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Notify me" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This product is in stock now — you can order it.",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Notify me" }),
    ).toBeInTheDocument();
  });

  it("shows the checkout message for an empty email without calling the API", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Notify me" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter a valid email address.",
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the generic error when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    renderForm();
    fireEvent.change(
      screen.getByLabelText(
        "Email address for stock alerts on SAMPLE Futuristic A",
      ),
      { target: { value: "customer@example.com" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Notify me" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Something went wrong. Please try again.",
      ),
    );
  });
});
