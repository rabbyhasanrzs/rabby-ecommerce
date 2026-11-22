import AdminCustomersPage from "@/app/admin/(protected)/customers/page";
import { adminListCustomers } from "@/app/admin/(protected)/admin-data";
import {
  CUSTOMER_ID_HEX_LENGTH,
  customerIdForPhone,
  isCustomerId,
  isPhoneShaped,
} from "@/lib/customer-id";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * Opaque customer id (S-6 follow-up, D-S6-4) — deterministic hash slug
 * of the normalized BD phone; a raw phone must never work as an id,
 * and the customers list must link by hash, never by phone.
 */

vi.mock("@/app/admin/(protected)/admin-data", () => ({
  // Mocked, never the real server-only module: the list page test
  // only needs the customer rows it renders links for.
  adminListCustomers: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined),
}));

vi.mock("next/link", () => ({
  // Never actually rendered in this test (the page's element tree is
  // walked, not mounted); only the href props on the Link elements
  // are inspected.
  default: () => null,
}));

const mockedAdminListCustomers = vi.mocked(adminListCustomers);

describe("customerIdForPhone", () => {
  it("is deterministic: the same phone always gives the same id", () => {
    expect(customerIdForPhone("01712345678")).toBe(
      customerIdForPhone("01712345678"),
    );
  });

  it("is 16 lowercase hex characters", () => {
    const id = customerIdForPhone("01712345678");
    expect(id).toHaveLength(CUSTOMER_ID_HEX_LENGTH);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("gives the same id for every accepted form of the same phone", () => {
    const expected = customerIdForPhone("01712345678");
    expect(customerIdForPhone("+8801712345678")).toBe(expected);
    expect(customerIdForPhone("8801712345678")).toBe(expected);
    expect(customerIdForPhone("0171-234 5678")).toBe(expected);
  });

  it("gives different ids for different phones", () => {
    expect(customerIdForPhone("01712345678")).not.toBe(
      customerIdForPhone("01812345678"),
    );
    expect(customerIdForPhone("01712345678")).not.toBe(
      customerIdForPhone("01912345678"),
    );
  });
});

describe("isCustomerId / isPhoneShaped", () => {
  it("accepts a real hash id and rejects phone-shaped input as an id", () => {
    const id = customerIdForPhone("01712345678");
    expect(isCustomerId(id)).toBe(true);
    expect(isPhoneShaped(id)).toBe(false);
    // A raw phone is never a valid customer id.
    expect(isCustomerId("01712345678")).toBe(false);
    expect(isCustomerId("+8801712345678")).toBe(false);
    expect(isCustomerId("8801712345678")).toBe(false);
  });

  it("detects phone-shaped input in every accepted form", () => {
    expect(isPhoneShaped("01712345678")).toBe(true);
    expect(isPhoneShaped("+8801712345678")).toBe(true);
    expect(isPhoneShaped("8801712345678")).toBe(true);
    expect(isPhoneShaped("0171-234 5678")).toBe(true);
  });

  it("does not flag non-phone values as phone-shaped", () => {
    expect(isPhoneShaped("")).toBe(false);
    expect(isPhoneShaped("not-a-phone")).toBe(false);
    expect(isPhoneShaped("0171234567")).toBe(false);
    expect(isPhoneShaped("017123456789")).toBe(false);
  });
});

describe("admin customers list links", () => {
  it("links to each customer by opaque hash id, never by phone number", async () => {
    mockedAdminListCustomers.mockResolvedValue([
      {
        phone: "01712345678",
        name: "Test Customer",
        email: "test@example.com",
        order_count: 2,
        total_spent_bdt: 2500,
        last_order_at: "2026-11-22T10:00:00.000Z",
      },
    ]);
    // The page is an async server component, which jsdom cannot render
    // through @testing-library/react (it stays on the Suspense
    // fallback), so the test runs the real page content function and
    // walks its element tree for the hrefs it builds instead. The
    // mocked admin-data above supplies the customer rows.
    const pageElement = AdminCustomersPage();
    const contentElement = (
      pageElement.props as { children: React.ReactElement }
    ).children;
    const contentFn = contentElement.type as (
      props: Record<string, never>,
    ) => Promise<React.ReactElement>;
    const rendered = await contentFn({});
    const hrefs: string[] = [];
    collectHrefs(rendered, hrefs);
    expect(hrefs).toContain(
      `/admin/customers/${customerIdForPhone("01712345678")}`,
    );
    expect(hrefs.every((href) => !href.includes("01712345678"))).toBe(true);
  });
});

/** Collect every href prop in a rendered (unrendered-component) tree. */
function collectHrefs(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectHrefs(child, out));
    return;
  }
  const element = node as {
    props?: { href?: unknown; children?: unknown };
  };
  if (typeof element.props?.href === "string") {
    out.push(element.props.href);
  }
  collectHrefs(element.props?.children, out);
}
