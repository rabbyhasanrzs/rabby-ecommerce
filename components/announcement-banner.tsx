"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Storefront announcement banner (S-6 follow-up, D-S6-5).
 *
 * Renders the admin's websiteNotice (Settings, lib/site-settings.ts,
 * max 500 chars) as a bar at the very top of every storefront page,
 * above the site header. Placed in the root layout, which also wraps
 * /admin — so the banner is storefront-only: it renders nothing on
 * any route whose path starts with /admin.
 *
 * Storefront-only guard: usePathname from next/navigation. The root
 * layout itself cannot read the pathname (server components cannot),
 * so the check lives here, in this client component. The component
 * is wrapped in <Suspense fallback={null}> in app/layout.tsx: with
 * cacheComponents on, usePathname can suspend on routes with dynamic
 * params not covered by generateStaticParams (e.g. /product/[slug]),
 * and the Suspense boundary keeps the rest of the layout prerendered
 * instead of failing the build.
 *
 * Static prerendering: the notice is fetched client-side on mount
 * (GET /api/settings, same pattern as components/checkout-form.tsx),
 * so no server render depends on it and storefront pages stay static.
 * While loading, or if the fetch fails, nothing renders — no banner,
 * no reserved space, no layout shift.
 *
 * Style: Deep Burgundy #7A263A background, white text — the brand
 * accent (app/globals.css --color-action / --color-text-inverse
 * tokens; no hard-coded hex, per the token rules). Burgundy was
 * picked over Charcoal because the bar sits on the Warm Ivory page
 * and the burgundy bar reads as the brand accent, matching the
 * checkout button (bg-action text-text-inverse).
 *
 * XSS: the notice is rendered as React TEXT ({notice}) — never
 * dangerouslySetInnerHTML, no HTML parsing. Any HTML an admin saves
 * in Settings (e.g. <script> or <b>) is escaped by React and shown
 * as literal text, never executed or turned into elements.
 */
export default function AnnouncementBanner() {
  const pathname = usePathname();
  // null = still loading, or the fetch failed — render nothing.
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // No fetch on admin routes — the banner never renders there.
    if (pathname?.startsWith("/admin")) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/settings");
        if (!response?.ok) {
          return;
        }
        const data: unknown = await response.json();
        if (!cancelled && data && typeof data === "object") {
          const value = (data as Record<string, unknown>).websiteNotice;
          if (typeof value === "string") {
            setNotice(value);
          }
        }
      } catch {
        // Settings unavailable — no banner, storefront keeps working.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Storefront only — the root layout also wraps /admin pages.
  if (pathname?.startsWith("/admin")) {
    return null;
  }
  // Empty / blank / missing notice → no banner and no empty space.
  if (!notice || notice.trim() === "") {
    return null;
  }

  return (
    <div
      role="status"
      className="bg-action px-4 py-2 text-center text-sm text-text-inverse"
    >
      <p>{notice.trim()}</p>
    </div>
  );
}
