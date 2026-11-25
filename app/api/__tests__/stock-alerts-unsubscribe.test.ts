/**
 * @vitest-environment node
 */
import { GET, POST } from "@/app/api/stock-alerts/unsubscribe/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { unsubscribeMock } = vi.hoisted(() => ({
  unsubscribeMock: vi.fn(),
}));

/** The route only uses the stock-alerts unsubscribe wrapper — mock that (not the network). */
vi.mock("@/lib/stock-alerts", () => ({
  unsubscribeStockAlert: unsubscribeMock,
}));

const TOKEN = "123e4567-e89b-12d3-a456-426614174000";

beforeEach(() => {
  vi.clearAllMocks();
  unsubscribeMock.mockResolvedValue({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/stock-alerts/unsubscribe?token=…
// ---------------------------------------------------------------------------

describe("GET /api/stock-alerts/unsubscribe", () => {
  it("unsubscribes and shows the confirmation page for a valid token", async () => {
    const response = await GET(
      new Request(`http://localhost/api/stock-alerts/unsubscribe?token=${TOKEN}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("You've been unsubscribed");
    expect(unsubscribeMock).toHaveBeenCalledWith(TOKEN);
  });

  it("shows the invalid-link page for a malformed token, without calling unsubscribe", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/stock-alerts/unsubscribe?token=not-a-uuid",
      ),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("This unsubscribe link isn't valid.");
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it("shows the invalid-link page when the token is missing", async () => {
    const response = await GET(
      new Request("http://localhost/api/stock-alerts/unsubscribe"),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("This unsubscribe link isn't valid.");
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it("shows the generic page when the unsubscribe fails", async () => {
    unsubscribeMock.mockRejectedValue(new Error("boom"));
    const response = await GET(
      new Request(`http://localhost/api/stock-alerts/unsubscribe?token=${TOKEN}`),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Something went wrong. Please try again.");
  });
});

// ---------------------------------------------------------------------------
// POST /api/stock-alerts/unsubscribe
// ---------------------------------------------------------------------------

describe("POST /api/stock-alerts/unsubscribe", () => {
  function postUnsubscribe(body: unknown): Promise<Response> {
    return POST(
      new Request("http://localhost/api/stock-alerts/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  it("returns 200 on a valid token", async () => {
    const response = await postUnsubscribe({ token: TOKEN });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(unsubscribeMock).toHaveBeenCalledWith(TOKEN);
  });

  it("returns 400 for a malformed token", async () => {
    const response = await postUnsubscribe({ token: "not-a-uuid" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("This unsubscribe link isn't valid.");
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it("returns 500 generic when the unsubscribe fails", async () => {
    unsubscribeMock.mockRejectedValue(new Error("boom"));
    const response = await postUnsubscribe({ token: TOKEN });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Something went wrong. Please try again.");
  });
});
