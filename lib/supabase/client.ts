import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client — S-1, anon key only (audit §5 / G-C2).
 *
 * Uses ONLY the public anon key (NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY). The anon key is public by design;
 * Row Level Security — not key secrecy — is the protection. The
 * service-role key must NEVER appear here or in any NEXT_PUBLIC_*
 * variable: it bypasses RLS entirely and is server-only (S-4 API
 * routes, if ever needed).
 *
 * Returns null when the public env vars are missing (e.g. a CI build
 * with no .env.local), so pages can render a graceful "catalogue
 * unavailable" state instead of throwing at build time. The Supabase
 * tables do not exist yet (the SQL runs later in the dashboard), so
 * every read is also wrapped in try/catch at the call site.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      // Read-only catalogue: no auth session is ever needed in S-1.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
