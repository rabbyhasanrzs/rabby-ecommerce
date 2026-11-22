import MfaEnrollment from "@/components/admin/mfa-enrollment";
import SettingsForm, {
  type DiscountCodeRow,
} from "@/components/admin/settings-form";
import { getSiteSettings } from "@/lib/site-settings";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";

/**
 * Admin Settings page — Slice C (S-4, T-48).
 *
 * Server component: requireAdmin() first (redirects a logged-out
 * visitor to /admin/login, a non-admin to /admin/login?error=
 * forbidden), then the settings row (Slice A's read layer) and the
 * discount-codes list (admin JWT client — RLS
 * discount_codes_admin_all, migration 0005). The MFA enrollment
 * component (Slice A) is placed at the bottom of this page.
 * A failed discount-codes read renders an empty list rather than
 * crashing the page; the settings form itself shows the values.
 */
export default async function AdminSettingsPage() {
  // Request-time rendering first: requireAdmin() reads the session
  // with supabase.auth.getUser(), and @supabase/auth-js checks the
  // token expiry with Date.now() on every such call — Next 16 (Cache
  // Components) flags that as an unstable value during prerendering
  // ("Route ... encountered the unstable value `Date.now()` while
  // prerendering"). Every other admin page already does this; this
  // page was the only one missing it (with Analytics).
  await connection();
  await requireAdmin();

  const settings = await getSiteSettings();

  let discountCodes: DiscountCodeRow[] = [];
  try {
    const supabase = (await createAdminClient()) as unknown as SupabaseClient;
    const { data, error } = await supabase
      .from("discount_codes")
      .select("code,percent_off,active")
      .order("code", { ascending: true });
    if (!error && data) {
      discountCodes = data as DiscountCodeRow[];
    }
  } catch {
    discountCodes = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
          Settings
        </h1>
        <p className="mt-2 text-text-secondary">
          Payment, tax, delivery, discount codes, website notice and
          support contacts. These values are the storefront&apos;s
          configuration — saving here changes what shoppers see at
          checkout.
        </p>
      </div>

      <SettingsForm settings={settings} discountCodes={discountCodes} />

      <section
        aria-labelledby="mfa-heading"
        className="rounded-lg border border-border bg-surface p-4 sm:p-6"
      >
        <h2
          id="mfa-heading"
          className="font-display text-xl font-bold"
        >
          Two-factor authentication (MFA)
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Add an authenticator app (for example Google Authenticator) so
          signing in needs a 6-digit code as well as the password.
          Enrolling signs out other sessions — keep the recovery codes
          somewhere safe.
        </p>
        <div className="mt-4">
          <MfaEnrollment />
        </div>
      </section>
    </div>
  );
}
