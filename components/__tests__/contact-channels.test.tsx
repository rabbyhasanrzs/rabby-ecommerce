import ContactChannels from "@/components/contact-channels";
import ContactPage from "@/app/contact/page";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

const emptySettings = {
  ok: true,
  json: async () => ({
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
    websiteNotice: "",
    supportWhatsapp: "",
    supportMessenger: "",
    supportPhone: "",
    supportEmail: "",
  }),
};

describe("Contact page (S-5, T-53)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it("renders the heading and all four channels", () => {
    fetchMock.mockResolvedValueOnce(emptySettings);
    render(<ContactPage />);

    expect(
      screen.getByRole("heading", { name: "Contact" }),
    ).toBeInTheDocument();
    for (const channel of [
      "WhatsApp (primary)",
      "Messenger (secondary)",
      "Phone",
      "Email",
    ]) {
      expect(screen.getByText(channel)).toBeInTheDocument();
    }
    expect(fetchMock).toHaveBeenCalledWith("/api/settings");
  });

  it("shows labelled placeholders while settings load and when fields are empty", async () => {
    fetchMock.mockResolvedValueOnce(emptySettings);
    render(<ContactChannels />);

    // Placeholders show immediately, before the fetch resolves.
    expect(
      screen.getAllByText("Not provided yet — coming soon."),
    ).toHaveLength(4);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Empty support fields stay as labelled placeholders — never
    // an invented number or link.
    expect(
      screen.getAllByText("Not provided yet — coming soon."),
    ).toHaveLength(4);
  });

  it("shows the real values once the owner provides them", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...((await emptySettings.json()) as Record<string, unknown>),
        supportWhatsapp: "https://wa.me/8801712345678",
        supportPhone: "01712345678",
      }),
    });
    render(<ContactChannels />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "https://wa.me/8801712345678" }),
      ).toHaveAttribute("href", "https://wa.me/8801712345678");
    });
    expect(screen.getByText("01712345678")).toBeInTheDocument();
    // The two channels still empty stay labelled placeholders.
    expect(
      screen.getAllByText("Not provided yet — coming soon."),
    ).toHaveLength(2);
  });

  it("keeps placeholders when the settings fetch fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    render(<ContactChannels />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      screen.getAllByText("Not provided yet — coming soon."),
    ).toHaveLength(4);
  });
});
