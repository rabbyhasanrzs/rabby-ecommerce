/**
 * @vitest-environment node
 */
import { POST as updatePayment } from "@/app/api/admin/orders/[reference]/payment/route";
import { POST as updateStatus } from "@/app/api/admin/orders/[reference]/status/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminClientMock,
  checkAccessMock,
  getEnvMock,
  adminGetOrderMock,
  updateOrderStatusMock,
  updatePaymentStatusMock,
  sendStatusEmailMock,
  sendPaymentFailedEmailMock,
} = vi.hoisted(() => ({
  adminClientMock: vi.fn(),
  checkAccessMock: vi.fn(),
  getEnvMock: vi.fn(),
  adminGetOrderMock: vi.fn(),
  updateOrderStatusMock: vi.fn(),
  updatePaymentStatusMock: vi.fn(),
  sendStatusEmailMock: vi.fn(),
  sendPaymentFailedEmailMock: vi.fn(),
}));

/**
 * Order admin routes tests (S-6 follow-up — same hidden-error class
 * as the inventory save bug, PR #26): auth failures must come back
 * as 401 JSON with the reason and a code — never a redirect,
 * because fetch() cannot use a login redirect. No network: mocked
 * admin gate + mocked RPC helpers. The auth check runs before the
 * body is read, so the unauthenticated tests need no valid body.
 */
vi.mock("@/app/admin/(protected)/admin-data", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/app/admin/(protected)/admin-data")>();
  return {
    ...original,
    adminClient: adminClientMock,
    adminGetOrder: adminGetOrderMock,
    adminUpdateOrderStatus: updateOrderStatusMock,
    adminUpdatePaymentStatus: updatePaymentStatusMock,
  };
});
vi.mock("@/lib/order-email", () => ({
  sendOrderStatusEmail: sendStatusEmailMock,
  sendPaymentFailedEmail: sendPaymentFailedEmailMock,
}));
vi.mock("@/lib/supabase/admin", () => ({
  checkAdminAccess: checkAccessMock,
  getSupabaseAdminEnv: getEnvMock,
  // Never called by these routes, but admin-data imports them — keep
  // the mocked module complete so importOriginal above cannot fail.
  createAdminClient: vi.fn(),
  requireAdmin: vi.fn(),
}));

const REFERENCE = "RB-123456";

function postStatus(body: unknown): Promise<Response> {
  return updateStatus(
    new Request(`http://localhost/api/admin/orders/${REFERENCE}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reference: REFERENCE }) },
  );
}

function postPayment(body: unknown): Promise<Response> {
  return updatePayment(
    new Request(`http://localhost/api/admin/orders/${REFERENCE}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reference: REFERENCE }) },
  );
}

describe("POST /api/admin/orders/[reference]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvMock.mockReturnValue({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    checkAccessMock.mockResolvedValue({
      status: "ok",
      user: { id: "admin-id" },
    });
    adminGetOrderMock.mockResolvedValue({ order: { status: "placed" } });
    updateOrderStatusMock.mockResolvedValue({ ok: true });
    sendStatusEmailMock.mockResolvedValue({ status: "sent" });
  });

  it("answers 401 JSON with the reason when the session ended — never a redirect", async () => {
    checkAccessMock.mockResolvedValue({ status: "unauthenticated", user: null });
    const res = await postStatus({ status: "confirmed" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: false,
      error: "Your session ended. Please sign in again.",
      code: "unauthenticated",
    });
    expect(updateOrderStatusMock).not.toHaveBeenCalled();
  });

  it("answers 401 JSON with forbidden when the account is not an admin", async () => {
    checkAccessMock.mockResolvedValue({ status: "forbidden", user: null });
    const res = await postStatus({ status: "confirmed" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("forbidden");
    expect(body.error).toBe("This account is not an admin.");
  });

  it("updates the status and sends one status email (previous status passed through)", async () => {
    const res = await postStatus({ status: "confirmed" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      reference: REFERENCE,
      status: "confirmed",
    });
    expect(updateOrderStatusMock).toHaveBeenCalledWith(
      REFERENCE,
      "confirmed",
      null,
    );
    expect(sendStatusEmailMock).toHaveBeenCalledTimes(1);
    expect(sendStatusEmailMock).toHaveBeenCalledWith({
      reference: REFERENCE,
      status: "confirmed",
      previousStatus: "placed",
      note: null,
    });
  });

  it("still returns ok when the email send fails — the update never fails on email", async () => {
    sendStatusEmailMock.mockRejectedValue(new Error("SMTP down"));
    const res = await postStatus({ status: "shipped" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      reference: REFERENCE,
      status: "shipped",
    });
    expect(updateOrderStatusMock).toHaveBeenCalledTimes(1);
  });

  it("passes the unchanged status through for a same-status re-save, so the send function skips the duplicate", async () => {
    adminGetOrderMock.mockResolvedValue({ order: { status: "confirmed" } });
    const res = await postStatus({ status: "confirmed" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      reference: REFERENCE,
      status: "confirmed",
    });
    expect(sendStatusEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "confirmed", previousStatus: "confirmed" }),
    );
  });

  it("does not send an email for Placed — it is not a valid target (confirmation email covers it)", async () => {
    const res = await postStatus({ status: "placed" });
    expect(res.status).toBe(400);
    expect(updateOrderStatusMock).not.toHaveBeenCalled();
    expect(sendStatusEmailMock).not.toHaveBeenCalled();
  });

  it("does not send an email when the transition is invalid", async () => {
    updateOrderStatusMock.mockResolvedValue({
      ok: false,
      error: "invalid_transition",
    });
    const res = await postStatus({
      status: "cancelled",
      note: "Customer asked to cancel",
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      ok: false,
      error: "That status change is not allowed from here.",
    });
    expect(sendStatusEmailMock).not.toHaveBeenCalled();
  });

  it("passes the cancel reason through to the email", async () => {
    const res = await postStatus({
      status: "cancelled",
      note: "Customer asked to cancel",
    });
    expect(res.status).toBe(200);
    expect(sendStatusEmailMock).toHaveBeenCalledWith({
      reference: REFERENCE,
      status: "cancelled",
      previousStatus: "placed",
      note: "Customer asked to cancel",
    });
  });

  it("sends the Returned email via the send function (Returned now triggers)", async () => {
    adminGetOrderMock.mockResolvedValue({ order: { status: "delivered" } });
    const res = await postStatus({ status: "returned" });
    expect(res.status).toBe(200);
    expect(sendStatusEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "returned", previousStatus: "delivered" }),
    );
  });
});

describe("POST /api/admin/orders/[reference]/payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvMock.mockReturnValue({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    checkAccessMock.mockResolvedValue({
      status: "ok",
      user: { id: "admin-id" },
    });
    updatePaymentStatusMock.mockResolvedValue({ ok: true });
    sendPaymentFailedEmailMock.mockResolvedValue({ status: "sent" });
  });

  it("answers 401 JSON with the reason when the session ended — never a redirect", async () => {
    checkAccessMock.mockResolvedValue({ status: "unauthenticated", user: null });
    const res = await postPayment({ status: "paid" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: false,
      error: "Your session ended. Please sign in again.",
      code: "unauthenticated",
    });
    expect(updatePaymentStatusMock).not.toHaveBeenCalled();
    expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
  });

  it("calls the payment-failed email once when the payment is marked failed", async () => {
    const res = await postPayment({ status: "failed" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      reference: REFERENCE,
      status: "failed",
    });
    expect(updatePaymentStatusMock).toHaveBeenCalledWith(REFERENCE, "failed");
    expect(sendPaymentFailedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPaymentFailedEmailMock).toHaveBeenCalledWith({
      reference: REFERENCE,
      note: null,
    });
  });

  it("passes the admin note through to the payment-failed email", async () => {
    const res = await postPayment({
      status: "failed",
      note: "Transaction ID not found",
    });
    expect(res.status).toBe(200);
    expect(sendPaymentFailedEmailMock).toHaveBeenCalledWith({
      reference: REFERENCE,
      note: "Transaction ID not found",
    });
  });

  it("does not send an email when the payment is marked paid", async () => {
    const res = await postPayment({ status: "paid" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      reference: REFERENCE,
      status: "paid",
    });
    expect(updatePaymentStatusMock).toHaveBeenCalledWith(REFERENCE, "paid");
    expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
  });

  it("does not send an email when the transition is invalid", async () => {
    updatePaymentStatusMock.mockResolvedValue({
      ok: false,
      error: "invalid_transition",
    });
    const res = await postPayment({ status: "failed" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Only a pending payment can be marked paid or failed.",
    });
    expect(sendPaymentFailedEmailMock).not.toHaveBeenCalled();
  });

  it("still returns ok when the email send fails — the update never fails on email", async () => {
    sendPaymentFailedEmailMock.mockRejectedValue(new Error("SMTP down"));
    const res = await postPayment({ status: "failed" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      reference: REFERENCE,
      status: "failed",
    });
    expect(updatePaymentStatusMock).toHaveBeenCalledTimes(1);
  });
});
