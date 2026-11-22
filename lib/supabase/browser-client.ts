import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client (S-4, T-40) — anon key only, for the
 * client-side admin flows that must run in the browser: MFA
 * enrollment (components/admin/mfa-enrollment.tsx). The anon key is
 * public by design; RLS + SECURITY DEFINER functions are the
 * protection. The service_role key must NEVER appear here.
 *
 * Returns null when the public env vars are missing (e.g. a CI build
 * with no .env.local) so callers can render a plain-words message
 * instead of throwing.
 */
export function createBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return createSupabaseBrowserClient(url, anonKey);
}
