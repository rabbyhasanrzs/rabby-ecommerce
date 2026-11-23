import SignOutButton from "@/components/admin/sign-out-button";
import { requireAdmin } from "@/app/admin/(protected)/admin-data";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

/** S-6, T-61, S6-10: the whole admin area is noindex. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin shell (S-4, T-41–T-46) — server layout for every /admin page
 * except /admin/login (Slice A owns the login page, outside this
 * route group).
 *
 * FIRST line calls requireAdmin(): the real role gate — a logged-out
 * visitor is redirected to /admin/login, a non-admin to
 * /admin/login?error=forbidden. No admin page renders before it.
 *
 * `export const instant = false` — with Cache Components enabled,
 * reading the session (cookies()) at a layout's top level is a
 * build error unless the segment is allowed to block; this is the
 * opt-out the Next.js "Authentication with Cache Components" guide
 * prescribes for an auth gate ("Set `export const instant = false`
 * on the page or layout to let it keep blocking on the server").
 * The gate must run before anything renders (it redirects), so it
 * cannot sit behind a Suspense boundary instead.
 *
 * The admin area is hidden from customers: there is no Admin link in
 * the storefront header or footer; /admin is reached only by typing
 * the URL. "Back to store" below is the way out.
 *
 * `await connection()` FIRST, before requireAdmin(): Next 16 (Cache
 * Components) patches the global Date during prerendering and flags
 * every `Date.now()` as an unstable value ("Route ... encountered the
 * unstable value `Date.now()` while prerendering"). requireAdmin()
 * reads the session with supabase.auth.getUser(), and @supabase/auth-js
 * checks the token expiry with Date.now() on every such call — so
 * without connection() the shell render logs that error on every
 * /admin request (the pages still render: Next falls back to a dynamic
 * render after aborting the shell). connection() forces request-time
 * rendering for the whole admin subtree, so the session read happens
 * in the dynamic stage where Date.now() is allowed. The pages' own
 * connection() calls come too late — they run inside Suspense-wrapped
 * content, after this layout. Do not remove this line without also
 * removing the admin gate's Date.now() dependency.
 */
export const instant = false;

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Request-time rendering first (see the comment above): the gate's
  // session read calls Date.now() via @supabase/auth-js, which Next 16
  // flags as an unstable value during the shell render.
  await connection();
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside
          aria-label="Admin menu"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2 className="font-display text-xl font-bold text-text">
            RabbY Admin
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Store management — customers never see this area.
          </p>
          <nav className="mt-4">
            <ul className="space-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-md px-3 py-2 font-semibold text-text hover:bg-background-subtle hover:text-action"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 space-y-2 border-t border-border pt-4">
            <Link
              href="/"
              className="block rounded-md px-3 py-2 font-semibold text-text-secondary hover:bg-background-subtle hover:text-action"
            >
              ← Back to store
            </Link>
            <SignOutButton />
          </div>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
