import {
  ALLOWED_TARGET_STATUSES,
  allowedTargetStatuses,
} from "@/lib/order-status-targets";
import { describe, expect, it } from "vitest";

/**
 * Free order-status movement (S-6 follow-up, D-S6-3).
 *
 * From any current status the admin may jump to ANY target the
 * server accepts — one jump (Placed -> Delivered) or step by step.
 * The lists below are exactly the set the server accepts: the Zod
 * enum (orderStatusUpdateSchema) and admin_update_order_status
 * (migration 0005) both accept any valid status and only reject
 * invalid status strings and moves out of the terminal statuses
 * (cancelled / failed / refunded). No migration ships with this
 * change — the server already accepted free movement; only the UI
 * list was next-only.
 */
describe("allowedTargetStatuses (free movement)", () => {
  it("from placed offers every later step plus Cancel", () => {
    expect(allowedTargetStatuses("placed")).toEqual([
      "confirmed",
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ]);
  });

  it("from confirmed offers every later step plus Cancel", () => {
    expect(allowedTargetStatuses("confirmed")).toEqual([
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ]);
  });

  it("from processing allows a backward jump to Confirmed plus every later step and Cancel", () => {
    expect(allowedTargetStatuses("processing")).toEqual([
      "confirmed",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ]);
  });

  it("from packed allows backward jumps to Confirmed / Processing plus every later step and Cancel", () => {
    expect(allowedTargetStatuses("packed")).toEqual([
      "confirmed",
      "processing",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ]);
  });

  it("from shipped allows backward jumps but no Cancel (already shipped)", () => {
    expect(allowedTargetStatuses("shipped")).toEqual([
      "confirmed",
      "processing",
      "packed",
      "out_for_delivery",
      "delivered",
    ]);
  });

  it("from out_for_delivery allows backward jumps but no Cancel", () => {
    expect(allowedTargetStatuses("out_for_delivery")).toEqual([
      "confirmed",
      "processing",
      "packed",
      "shipped",
      "delivered",
    ]);
  });

  it("from delivered offers only Returned (the return path)", () => {
    expect(allowedTargetStatuses("delivered")).toEqual(["returned"]);
  });

  it("from returned offers only Refunded", () => {
    expect(allowedTargetStatuses("returned")).toEqual(["refunded"]);
  });

  it("terminal statuses offer nothing", () => {
    expect(allowedTargetStatuses("cancelled")).toEqual([]);
    expect(allowedTargetStatuses("failed")).toEqual([]);
    expect(allowedTargetStatuses("refunded")).toEqual([]);
  });

  it("an unknown status offers nothing", () => {
    expect(allowedTargetStatuses("not-a-status")).toEqual([]);
  });

  it("never offers placed (initial state) or failed (system status) as a target", () => {
    for (const targets of Object.values(ALLOWED_TARGET_STATUSES)) {
      expect(targets).not.toContain("placed");
      expect(targets).not.toContain("failed");
    }
  });

  it("every target is a status the API enum accepts", () => {
    // orderStatusUpdateSchema enum: confirmed, processing, packed,
    // shipped, out_for_delivery, delivered, cancelled, returned,
    // refunded. Kept in sync by hand here so a drift shows up as a
    // failing test rather than a silent UI/server mismatch.
    const apiTargets = new Set([
      "confirmed",
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "returned",
      "refunded",
    ]);
    for (const targets of Object.values(ALLOWED_TARGET_STATUSES)) {
      for (const target of targets) {
        expect(apiTargets.has(target)).toBe(true);
      }
    }
  });
});
