import { DEMO_TAX_RATE_PERCENT, DELIVERY_OPTIONS } from "@/lib/demo-config";
import { getSupabaseClient } from "@/lib/supabase/client";
import { z } from "zod";

/**
 * Site settings — the T-48 data layer (S-4, Slice A).
 *
 * The site_settings table (migration 0005, single row id = 1) is the
 * source of truth for shop config once S-4 lands: tax %, delivery
 * fees/estimates, which payment methods are on, the website notice
 * and support contacts. The seeded row holds the DEMO CONFIG numbers
 * (tax 5%, Inside ৳60 / 1–2 days, Outside ৳120 / 3–5 days, all
 * payment methods on, empty notice/contacts) so nothing changes
 * until the owner edits them in Admin (FR-16–FR-19).
 *
 * FIELD NAMES: camelCase here (taxRatePercent, ...), per the Slice A
 * contract. The database columns are snake_case (tax_rate_percent,
 * ...) and the mapping lives in parseSiteSettingsRow / the update
 * below. NOTE FOR THE COORDINATOR: Slice C's temporary stub for this
 * file used snake_case field names — the Settings UI must use these
 * camelCase names (or the stub's names must be aligned here).
 *
 * getSiteSettings() NEVER throws — on any failure (no client, no
 * row, bad data) it returns DEFAULT_SETTINGS, so the storefront
 * keeps working.
 *
 * The admin-only write (updateSiteSettingsAction) lives in
 * lib/site-settings-actions.ts — a separate "use server" module.
 * It MUST stay separate: this file is imported by the client-side
 * Settings form (for the SiteSettings type), and a module that
 * imports next/cache / next/headers cannot be bundled for the
 * browser. The action module imports the schema + parse helper
 * from here.
 *
 * NOTE: this module is safe to import from client components ONLY
 * as a type (SiteSettings) — its runtime helpers (getSiteSettings,
 * DEFAULT_SETTINGS, the zod schema) are used from server code and
 * the API route. The checkout form fetches GET /api/settings
 * instead of importing this module at runtime.
 */

export interface SiteSettings {
  taxRatePercent: number;
  deliveryInsideFeeBdt: number;
  deliveryInsideEstimate: string;
  deliveryOutsideFeeBdt: number;
  deliveryOutsideEstimate: string;
  paymentCodEnabled: boolean;
  paymentBkashEnabled: boolean;
  paymentNagadEnabled: boolean;
  paymentRocketEnabled: boolean;
  paymentCardEnabled: boolean;
  websiteNotice: string;
  supportWhatsapp: string;
  supportMessenger: string;
  supportPhone: string;
  supportEmail: string;
}

/** The DEMO CONFIG numbers (lib/demo-config.ts) as the safe fallback. */
export const DEFAULT_SETTINGS: SiteSettings = {
  taxRatePercent: DEMO_TAX_RATE_PERCENT,
  deliveryInsideFeeBdt: DELIVERY_OPTIONS.inside.feeBdt,
  deliveryInsideEstimate: DELIVERY_OPTIONS.inside.estimate,
  deliveryOutsideFeeBdt: DELIVERY_OPTIONS.outside.feeBdt,
  deliveryOutsideEstimate: DELIVERY_OPTIONS.outside.estimate,
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

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Map one site_settings row (snake_case, from the database) to
 * SiteSettings. Any field that is missing or the wrong type falls
 * back to its DEFAULT_SETTINGS value field-by-field, so one bad
 * column can never break the whole storefront.
 */
export function parseSiteSettingsRow(row: unknown): SiteSettings {
  const source = (row ?? {}) as Record<string, unknown>;
  return {
    taxRatePercent:
      isInt(source.tax_rate_percent) &&
      source.tax_rate_percent >= 0 &&
      source.tax_rate_percent <= 100
        ? source.tax_rate_percent
        : DEFAULT_SETTINGS.taxRatePercent,
    deliveryInsideFeeBdt:
      isInt(source.delivery_inside_fee_bdt) &&
      source.delivery_inside_fee_bdt >= 0
        ? source.delivery_inside_fee_bdt
        : DEFAULT_SETTINGS.deliveryInsideFeeBdt,
    deliveryInsideEstimate: isNonEmptyString(
      source.delivery_inside_estimate,
    )
      ? source.delivery_inside_estimate
      : DEFAULT_SETTINGS.deliveryInsideEstimate,
    deliveryOutsideFeeBdt:
      isInt(source.delivery_outside_fee_bdt) &&
      source.delivery_outside_fee_bdt >= 0
        ? source.delivery_outside_fee_bdt
        : DEFAULT_SETTINGS.deliveryOutsideFeeBdt,
    deliveryOutsideEstimate: isNonEmptyString(
      source.delivery_outside_estimate,
    )
      ? source.delivery_outside_estimate
      : DEFAULT_SETTINGS.deliveryOutsideEstimate,
    paymentCodEnabled:
      typeof source.payment_cod_enabled === "boolean"
        ? source.payment_cod_enabled
        : DEFAULT_SETTINGS.paymentCodEnabled,
    paymentBkashEnabled:
      typeof source.payment_bkash_enabled === "boolean"
        ? source.payment_bkash_enabled
        : DEFAULT_SETTINGS.paymentBkashEnabled,
    paymentNagadEnabled:
      typeof source.payment_nagad_enabled === "boolean"
        ? source.payment_nagad_enabled
        : DEFAULT_SETTINGS.paymentNagadEnabled,
    paymentRocketEnabled:
      typeof source.payment_rocket_enabled === "boolean"
        ? source.payment_rocket_enabled
        : DEFAULT_SETTINGS.paymentRocketEnabled,
    paymentCardEnabled:
      typeof source.payment_card_enabled === "boolean"
        ? source.payment_card_enabled
        : DEFAULT_SETTINGS.paymentCardEnabled,
    websiteNotice:
      typeof source.website_notice === "string"
        ? source.website_notice
        : DEFAULT_SETTINGS.websiteNotice,
    supportWhatsapp:
      typeof source.support_whatsapp === "string"
        ? source.support_whatsapp
        : DEFAULT_SETTINGS.supportWhatsapp,
    supportMessenger:
      typeof source.support_messenger === "string"
        ? source.support_messenger
        : DEFAULT_SETTINGS.supportMessenger,
    supportPhone:
      typeof source.support_phone === "string"
        ? source.support_phone
        : DEFAULT_SETTINGS.supportPhone,
    supportEmail:
      typeof source.support_email === "string"
        ? source.support_email
        : DEFAULT_SETTINGS.supportEmail,
  };
}

/**
 * Read the shop settings (server-side, anon SELECT — site_settings
 * is public config, not a secret). Never throws: any failure returns
 * DEFAULT_SETTINGS.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return DEFAULT_SETTINGS;
    }
    const { data, error } = await supabase
      .from("site_settings")
      .select(
        "tax_rate_percent, delivery_inside_fee_bdt, " +
          "delivery_inside_estimate, delivery_outside_fee_bdt, " +
          "delivery_outside_estimate, payment_cod_enabled, " +
          "payment_bkash_enabled, payment_nagad_enabled, " +
          "payment_rocket_enabled, payment_card_enabled, website_notice, " +
          "support_whatsapp, support_messenger, support_phone, support_email",
      )
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      return DEFAULT_SETTINGS;
    }
    return parseSiteSettingsRow(data);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ---------------------------------------------------------------------------
// Admin write path (T-48) — validation + FormData parsing only.
// The action itself lives in lib/site-settings-actions.ts (separate
// "use server" module — see the header note).
// ---------------------------------------------------------------------------

/**
 * Validation for the Settings form. Numbers arrive as strings from
 * FormData, so they are coerced; booleans arrive as checkbox state
 * ('on' / absent) and are normalised by parseSiteSettingsForm below.
 */
export const siteSettingsFormSchema = z.object({
  taxRatePercent: z.coerce.number().int().min(0).max(100),
  deliveryInsideFeeBdt: z.coerce.number().int().min(0),
  deliveryInsideEstimate: z.string().min(1).max(100),
  deliveryOutsideFeeBdt: z.coerce.number().int().min(0),
  deliveryOutsideEstimate: z.string().min(1).max(100),
  paymentCodEnabled: z.boolean(),
  paymentBkashEnabled: z.boolean(),
  paymentNagadEnabled: z.boolean(),
  paymentRocketEnabled: z.boolean(),
  paymentCardEnabled: z.boolean(),
  websiteNotice: z.string().max(500),
  supportWhatsapp: z.string().max(500),
  supportMessenger: z.string().max(500),
  supportPhone: z.string().max(500),
  supportEmail: z.string().max(500),
});

/** Read the Settings form fields out of a FormData (pure, testable). */
export function parseSiteSettingsForm(
  formData: FormData,
): Record<string, unknown> {
  const text = (name: string): string =>
    String(formData.get(name) ?? "");
  return {
    taxRatePercent: text("taxRatePercent"),
    deliveryInsideFeeBdt: text("deliveryInsideFeeBdt"),
    deliveryInsideEstimate: text("deliveryInsideEstimate"),
    deliveryOutsideFeeBdt: text("deliveryOutsideFeeBdt"),
    deliveryOutsideEstimate: text("deliveryOutsideEstimate"),
    paymentCodEnabled: formData.get("paymentCodEnabled") === "on",
    paymentBkashEnabled: formData.get("paymentBkashEnabled") === "on",
    paymentNagadEnabled: formData.get("paymentNagadEnabled") === "on",
    paymentRocketEnabled: formData.get("paymentRocketEnabled") === "on",
    paymentCardEnabled: formData.get("paymentCardEnabled") === "on",
    websiteNotice: text("websiteNotice"),
    supportWhatsapp: text("supportWhatsapp"),
    supportMessenger: text("supportMessenger"),
    supportPhone: text("supportPhone"),
    supportEmail: text("supportEmail"),
  };
}
