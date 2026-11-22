"use server";

import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Discount-code server actions — Slice C (S-4, T-48).
 *
 * The payment / tax / delivery / notice / support section of the
 * Settings form submits via Slice A's updateSiteSettingsAction
 * (lib/site-settings.ts). Discount codes are this slice's own
 * actions: both are requireAdmin-guarded and write through the
 * admin's JWT client (RLS discount_codes_admin_all, migration 0005).
 *
 * Codes are NEVER hard-deleted: a code that was used on an order
 * stays in the table forever, and deactivating it (active = false)
 * is the only way to stop it being offered. There is no delete
 * action at all. A code is uppercase alphanumeric, 3–20 characters;
 * percent_off is an integer 1–100 (the table CHECK enforces the
 * same range — the zod check here gives the plain-words error).
 */

export interface DiscountActionState {
  ok: boolean;
  message: string;
}

const discountCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9]{3,20}$/,
      "Code must be 3–20 letters or numbers (A–Z, 0–9).",
    ),
  percentOff: z.coerce
    .number()
    .int("Percent must be a whole number.")
    .min(1, "Percent must be between 1 and 100.")
    .max(100, "Percent must be between 1 and 100."),
});

/** The admin client, untyped (same pattern as Slice B's admin-data.ts). */
async function adminClient(): Promise<SupabaseClient> {
  return (await createAdminClient()) as unknown as SupabaseClient;
}

/** Add a new discount code (starts active). */
export async function addDiscountCodeAction(
  _prevState: DiscountActionState | null,
  formData: FormData,
): Promise<DiscountActionState> {
  await requireAdmin();

  const parsed = discountCodeSchema.safeParse({
    code: formData.get("code"),
    percentOff: formData.get("percent_off"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the code and percent, then try again." };
  }
  const { code, percentOff } = parsed.data;

  const supabase = await adminClient();
  const { data: existing } = await supabase
    .from("discount_codes")
    .select("code")
    .eq("code", code)
    .maybeSingle();
  if (existing) {
    return { ok: false, message: `A code called ${code} already exists.` };
  }

  const { error } = await supabase
    .from("discount_codes")
    .insert({ code, percent_off: percentOff, active: true });
  if (error) {
    return { ok: false, message: "The code could not be added. Please try again." };
  }

  revalidatePath("/admin/settings");
  return { ok: true, message: `Discount code ${code} added (${percentOff}% off).` };
}

/** Activate / deactivate an existing code (never delete it). */
export async function toggleDiscountCodeAction(
  _prevState: DiscountActionState | null,
  formData: FormData,
): Promise<DiscountActionState> {
  await requireAdmin();

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const active = formData.get("active") === "true";
  if (!/^[A-Z0-9]{3,20}$/.test(code)) {
    return { ok: false, message: "That code is not valid." };
  }

  const supabase = await adminClient();
  const { error } = await supabase
    .from("discount_codes")
    .update({ active })
    .eq("code", code);
  if (error) {
    return { ok: false, message: "The code could not be updated. Please try again." };
  }

  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: active
      ? `Discount code ${code} is active again.`
      : `Discount code ${code} is deactivated. Past orders keep their discount.`,
  };
}
