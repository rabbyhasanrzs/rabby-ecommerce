import { getSiteSettings } from "@/lib/site-settings";
import { NextResponse } from "next/server";

/**
 * GET /api/settings — public shop config (S-4, T-48).
 *
 * Returns the site_settings row as JSON (tax %, delivery fees /
 * estimates, which payment methods are on, website notice, support
 * contacts). No auth, no secrets — these are the shop's public
 * settings, readable by anon under the site_settings SELECT policy.
 * The checkout form reads this on mount so its totals use the
 * admin-configured values; on any failure getSiteSettings() falls
 * back to the DEMO CONFIG defaults. Never cached: the owner can
 * change the values in Admin and the next fetch must see them.
 */
export async function GET() {
  const settings = await getSiteSettings();
  return NextResponse.json(settings, {
    headers: { "Cache-Control": "no-store" },
  });
}
