import { computeTotals, settingsToPricing } from "@/lib/pricing";
import {
  DEFAULT_SETTINGS,
  parseSiteSettingsForm,
  parseSiteSettingsRow,
  siteSettingsFormSchema,
} from "@/lib/site-settings";
import { describe, expect, it } from "vitest";

/**
 * Site settings tests (S-4, T-48) — no network.
 *
 * Covers the DEFAULT_SETTINGS fallback (demo-config numbers), the
 * field-by-field fallback in parseSiteSettingsRow, the
 * settingsToPricing mapping + computeTotals with settings, and the
 * admin save validation (tax bounds, fee bounds, string lengths).
 * The live database read (getSiteSettings) and the requireAdmin
 * guard on updateSiteSettingsAction are NOT unit-tested here — they
 * need a session + the Supabase test project (owner checklist).
 */

function validForm(): Record<string, unknown> {
  return {
    taxRatePercent: "5",
    deliveryInsideFeeBdt: "60",
    deliveryInsideEstimate: "1–2 days",
    deliveryOutsideFeeBdt: "120",
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
  };
}

describe("DEFAULT_SETTINGS", () => {
  it("holds the DEMO CONFIG numbers (tax 5%, delivery ৳60/৳120)", () => {
    expect(DEFAULT_SETTINGS).toEqual({
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
    });
  });
});

describe("parseSiteSettingsRow", () => {
  it("maps a full valid row (snake_case) to camelCase settings", () => {
    expect(
      parseSiteSettingsRow({
        tax_rate_percent: 10,
        delivery_inside_fee_bdt: 80,
        delivery_inside_estimate: "Same day",
        delivery_outside_fee_bdt: 150,
        delivery_outside_estimate: "2–4 days",
        payment_cod_enabled: false,
        payment_bkash_enabled: true,
        payment_nagad_enabled: false,
        payment_rocket_enabled: true,
        payment_card_enabled: false,
        website_notice: "Eid offer!",
        support_whatsapp: "01712345678",
        support_messenger: "rabby.shop",
        support_phone: "01712345678",
        support_email: "shop@example.com",
      }),
    ).toEqual({
      taxRatePercent: 10,
      deliveryInsideFeeBdt: 80,
      deliveryInsideEstimate: "Same day",
      deliveryOutsideFeeBdt: 150,
      deliveryOutsideEstimate: "2–4 days",
      paymentCodEnabled: false,
      paymentBkashEnabled: true,
      paymentNagadEnabled: false,
      paymentRocketEnabled: true,
      paymentCardEnabled: false,
      websiteNotice: "Eid offer!",
      supportWhatsapp: "01712345678",
      supportMessenger: "rabby.shop",
      supportPhone: "01712345678",
      supportEmail: "shop@example.com",
    });
  });

  it("falls back to defaults for a missing row", () => {
    expect(parseSiteSettingsRow(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSiteSettingsRow(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSiteSettingsRow({})).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back field-by-field: a bad tax keeps the other values", () => {
    const parsed = parseSiteSettingsRow({
      tax_rate_percent: 150,
      delivery_inside_fee_bdt: 80,
      delivery_inside_estimate: "Same day",
      delivery_outside_fee_bdt: 150,
      delivery_outside_estimate: "2–4 days",
      payment_cod_enabled: true,
      payment_bkash_enabled: true,
      payment_nagad_enabled: true,
      payment_rocket_enabled: true,
      payment_card_enabled: true,
      website_notice: "",
      support_whatsapp: "",
      support_messenger: "",
      support_phone: "",
      support_email: "",
    });
    expect(parsed.taxRatePercent).toBe(5);
    expect(parsed.deliveryInsideFeeBdt).toBe(80);
    expect(parsed.deliveryInsideEstimate).toBe("Same day");
  });

  it("rejects wrong types (a string tax, a negative fee, an empty estimate)", () => {
    const parsed = parseSiteSettingsRow({
      tax_rate_percent: "10",
      delivery_inside_fee_bdt: -5,
      delivery_inside_estimate: "",
      delivery_outside_fee_bdt: 120,
      delivery_outside_estimate: "3–5 days",
      payment_cod_enabled: "yes",
      payment_bkash_enabled: true,
      payment_nagad_enabled: true,
      payment_rocket_enabled: true,
      payment_card_enabled: true,
      website_notice: "",
      support_whatsapp: "",
      support_messenger: "",
      support_phone: "",
      support_email: "",
    });
    expect(parsed.taxRatePercent).toBe(5);
    expect(parsed.deliveryInsideFeeBdt).toBe(60);
    expect(parsed.deliveryInsideEstimate).toBe("1–2 days");
    expect(parsed.paymentCodEnabled).toBe(true);
  });
});

describe("settingsToPricing + computeTotals", () => {
  it("maps a SiteSettings object to the pricing shape", () => {
    expect(
      settingsToPricing({
        taxRatePercent: 10,
        deliveryInsideFeeBdt: 80,
        deliveryOutsideFeeBdt: 150,
      }),
    ).toEqual({
      taxRatePercent: 10,
      deliveryFees: { inside: 80, outside: 150 },
    });
  });

  it("computeTotals uses the settings values when provided", () => {
    const pricing = settingsToPricing({
      taxRatePercent: 10,
      deliveryInsideFeeBdt: 80,
      deliveryOutsideFeeBdt: 150,
    });
    // 1000 + 10% (100) + 80 = 1180 inside; 1000 + 100 + 150 = 1250 outside.
    expect(computeTotals(1000, "inside", pricing)).toEqual({
      subtotalBdt: 1000,
      taxBdt: 100,
      deliveryFeeBdt: 80,
      totalBdt: 1180,
    });
    expect(computeTotals(1000, "outside", pricing)).toEqual({
      subtotalBdt: 1000,
      taxBdt: 100,
      deliveryFeeBdt: 150,
      totalBdt: 1250,
    });
  });

  it("computeTotals keeps the demo-config defaults without settings", () => {
    expect(computeTotals(1000, "inside")).toEqual({
      subtotalBdt: 1000,
      taxBdt: 50,
      deliveryFeeBdt: 60,
      totalBdt: 1110,
    });
  });
});

describe("siteSettingsFormSchema (admin save validation)", () => {
  it("accepts a valid form", () => {
    expect(siteSettingsFormSchema.safeParse(validForm()).success).toBe(true);
  });

  it("accepts tax 0 and tax 100 (the bounds)", () => {
    expect(
      siteSettingsFormSchema.safeParse({ ...validForm(), taxRatePercent: "0" })
        .success,
    ).toBe(true);
    expect(
      siteSettingsFormSchema.safeParse({
        ...validForm(),
        taxRatePercent: "100",
      }).success,
    ).toBe(true);
  });

  it("rejects tax below 0, above 100, and non-integer tax", () => {
    for (const tax of ["-1", "101", "5.5", "abc"]) {
      expect(
        siteSettingsFormSchema.safeParse({
          ...validForm(),
          taxRatePercent: tax,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a negative delivery fee", () => {
    expect(
      siteSettingsFormSchema.safeParse({
        ...validForm(),
        deliveryInsideFeeBdt: "-1",
      }).success,
    ).toBe(false);
    expect(
      siteSettingsFormSchema.safeParse({
        ...validForm(),
        deliveryOutsideFeeBdt: "-10",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty delivery estimate", () => {
    expect(
      siteSettingsFormSchema.safeParse({
        ...validForm(),
        deliveryInsideEstimate: "",
      }).success,
    ).toBe(false);
  });

  it("rejects a notice / contact longer than 500 characters", () => {
    expect(
      siteSettingsFormSchema.safeParse({
        ...validForm(),
        websiteNotice: "x".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      siteSettingsFormSchema.safeParse({
        ...validForm(),
        supportEmail: "x".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("requires booleans for the payment flags", () => {
    expect(
      siteSettingsFormSchema.safeParse({
        ...validForm(),
        paymentCodEnabled: "on",
      }).success,
    ).toBe(false);
  });
});

describe("parseSiteSettingsForm", () => {
  it("turns checkboxes into booleans and keeps text fields", () => {
    const formData = new FormData();
    formData.set("taxRatePercent", "8");
    formData.set("deliveryInsideFeeBdt", "70");
    formData.set("deliveryInsideEstimate", "Same day");
    formData.set("deliveryOutsideFeeBdt", "130");
    formData.set("deliveryOutsideEstimate", "2–4 days");
    formData.set("paymentCodEnabled", "on");
    // bkash checkbox absent -> false.
    formData.set("paymentNagadEnabled", "on");
    formData.set("websiteNotice", "Sale!");
    const parsed = parseSiteSettingsForm(formData);
    expect(parsed.taxRatePercent).toBe("8");
    expect(parsed.paymentCodEnabled).toBe(true);
    expect(parsed.paymentBkashEnabled).toBe(false);
    expect(parsed.paymentNagadEnabled).toBe(true);
    expect(parsed.websiteNotice).toBe("Sale!");
  });
});
