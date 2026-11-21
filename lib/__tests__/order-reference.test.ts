import { isValidOrderReference } from "@/lib/supabase/orders";
import { describe, expect, it } from "vitest";

describe("isValidOrderReference", () => {
  it('accepts "RB-2026-123456"', () => {
    expect(isValidOrderReference("RB-2026-123456")).toBe(true);
  });

  it('rejects "RB-2026-12345" (5 digits)', () => {
    expect(isValidOrderReference("RB-2026-12345")).toBe(false);
  });

  it('rejects "rb-2026-123456" (lowercase)', () => {
    expect(isValidOrderReference("rb-2026-123456")).toBe(false);
  });

  it('rejects "RB-2026-1234567" (7 digits)', () => {
    expect(isValidOrderReference("RB-2026-1234567")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidOrderReference("")).toBe(false);
  });

  it('accepts surrounding spaces (trimmed): " RB-2026-123456 "', () => {
    expect(isValidOrderReference(" RB-2026-123456 ")).toBe(true);
  });
});
