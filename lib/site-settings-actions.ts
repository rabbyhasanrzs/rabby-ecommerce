"use server";

import {
  parseSiteSettingsForm,
  siteSettingsFormSchema,
} from "@/lib/site-settings";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Admin-only Settings save (S-4, T-48) — Server Action.
 *
 * This lives in its own "use server" module on purpose: the
 * client-side Settings form imports this action, and a "use server"
 * file is never bundled for the browser — so the next/cache and
 * next/headers imports below cannot leak into client code. The
 * validation schema + FormData parsing live in lib/site-settings.ts
 * (shared, testable, no server-only imports).
 *
 * Validates with zod, writes the single site_settings row via the
 * admin (cookie) client, and revalidates every page that reads the
 * settings. Returns plain {ok} shapes — no thrown errors for bad
 * input.
 *
 * NOTE: requireAdmin() redirects when the caller is not a verified
 * admin, so this action never reaches the write for a non-admin.
 * The RLS is_admin() ALL policy on site_settings is the second
 * layer (a direct table write by a non-admin is rejected by the
 * database, not only by this action).
 */
export async function updateSiteSettingsAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const parsed = siteSettingsFormSchema.safeParse(
    parseSiteSettingsForm(formData),
  );
  if (!parsed.success) {
    return { ok: false, error: "Please check the settings and try again." };
  }
  const settings = parsed.data;

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("site_settings")
    .update({
      tax_rate_percent: settings.taxRatePercent,
      delivery_inside_fee_bdt: settings.deliveryInsideFeeBdt,
      delivery_inside_estimate: settings.deliveryInsideEstimate,
      delivery_outside_fee_bdt: settings.deliveryOutsideFeeBdt,
      delivery_outside_estimate: settings.deliveryOutsideEstimate,
      payment_cod_enabled: settings.paymentCodEnabled,
      payment_bkash_enabled: settings.paymentBkashEnabled,
      payment_nagad_enabled: settings.paymentNagadEnabled,
      payment_rocket_enabled: settings.paymentRocketEnabled,
      payment_card_enabled: settings.paymentCardEnabled,
      payment_online_enabled: settings.paymentOnlineEnabled,
      website_notice: settings.websiteNotice,
      support_whatsapp: settings.supportWhatsapp,
      support_messenger: settings.supportMessenger,
      support_phone: settings.supportPhone,
      support_email: settings.supportEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    return {
      ok: false,
      error: "Settings could not be saved. Please try again.",
    };
  }

  revalidatePath("/");
  revalidatePath("/checkout");
  revalidatePath("/bag");
  revalidatePath("/admin/settings");
  return { ok: true };
}
