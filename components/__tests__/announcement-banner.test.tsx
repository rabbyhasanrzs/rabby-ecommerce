import AnnouncementBanner from "@/components/announcement-banner";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

const fetchMock = vi.fn();

// The banner only reads websiteNotice out of GET /api/settings; the
// rest of the settings shape is irrelevant here.
function settingsResponse(websiteNotice: unknown) {
  return {
    ok: true,
    json: async () => ({ websiteNotice }),
  };
}

describe("AnnouncementBanner (S-6 follow-up, D-S6-5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    pathnameMock.mockReturnValue("/");
  });

  it("renders the notice when it is set", async () => {
    fetchMock.mockResolvedValueOnce(
      settingsResponse("Eid offer — free delivery inside Dhaka"),
    );
    render(<AnnouncementBanner />);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/settings");
    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("Eid offer — free delivery inside Dhaka");
  });

  it("renders nothing when the notice is empty", async () => {
    fetchMock.mockResolvedValueOnce(settingsResponse(""));
    const { container } = render(<AnnouncementBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the notice is blank whitespace", async () => {
    fetchMock.mockResolvedValueOnce(settingsResponse("   "));
    const { container } = render(<AnnouncementBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the notice is missing from settings", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ taxRatePercent: 5 }),
    });
    const { container } = render(<AnnouncementBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the settings fetch fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const { container } = render(<AnnouncementBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders settings HTML as escaped text, never as elements", async () => {
    fetchMock.mockResolvedValueOnce(
      settingsResponse("<script>alert(1)</script> <b>bold</b>"),
    );
    const { container } = render(<AnnouncementBanner />);

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("<script>alert(1)</script> <b>bold</b>");
    // No element was created from the notice text.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("renders nothing on admin routes, even when a notice is set", async () => {
    pathnameMock.mockReturnValue("/admin/settings");
    fetchMock.mockResolvedValueOnce(
      settingsResponse("Eid offer — free delivery inside Dhaka"),
    );
    const { container } = render(<AnnouncementBanner />);

    // Let the mount effect run if it were going to — on admin routes
    // the banner must not even fetch settings.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
