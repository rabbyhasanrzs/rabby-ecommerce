import { adminClient, requireAdmin } from "@/app/admin/(protected)/admin-data";

/**
 * POST /api/admin/sign-out — end the admin's Supabase session and
 * return { ok: true }. requireAdmin() first, so only a signed-in
 * admin can call it. The client then navigates to /admin/login.
 */
export async function POST() {
  await requireAdmin();
  const supabase = await adminClient();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
