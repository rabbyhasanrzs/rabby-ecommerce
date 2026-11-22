import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AnnouncementBanner from "@/components/announcement-banner";
import MiniCartDrawer from "@/components/mini-cart-drawer";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { BagProvider } from "@/lib/bag-context";
import {
  HERO_IMAGE_PATH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";
import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Suspense } from "react";
import "./globals.css";

/**
 * og:image is the hero photo — but the hero is uploaded by the owner
 * AFTER merge (S-5 owner checklist), so it is only listed when the
 * file actually exists in public/images/ at build time. The URL
 * never 404s and never contains a literal space. A .webp hero is
 * accepted as well; .jpg is the name in the checklist.
 */
const heroFileExists =
  existsSync(join(process.cwd(), "public", "images", "hero.jpg")) ||
  existsSync(join(process.cwd(), "public", "images", "hero.webp"));
const heroPath = existsSync(join(process.cwd(), "public", "images", "hero.jpg"))
  ? HERO_IMAGE_PATH
  : "/images/hero.webp";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Sunglasses in Bangladesh`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: `${SITE_NAME} — Sunglasses in Bangladesh`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
    ...(heroFileExists ? { images: [{ url: heroPath }] } : {}),
  },
  twitter: {
    card: heroFileExists ? "summary_large_image" : "summary",
    title: `${SITE_NAME} — Sunglasses in Bangladesh`,
    description: SITE_DESCRIPTION,
    ...(heroFileExists ? { images: [heroPath] } : {}),
  },
  icons: {
    icon: "/favicon.svg",
  },
};

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <BagProvider>
          {/*
           * S-6 follow-up (D-S6-5): the admin's websiteNotice as a
           * storefront announcement banner, above the header on every
           * storefront page. The banner itself renders nothing on
           * /admin routes. Suspense fallback null: with cacheComponents
           * on, the banner's usePathname can suspend on routes with
           * dynamic params not covered by generateStaticParams
           * (e.g. /product/[slug]); the boundary keeps the rest of
           * the layout prerendered, and no banner space is reserved.
           */}
          <Suspense fallback={null}>
            <AnnouncementBanner />
          </Suspense>
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          <SiteFooter />
          <MiniCartDrawer />
        </BagProvider>
        {/*
         * S-6 monitoring: Vercel Analytics (page views) + Speed
         * Insights (real-visitor Core Web Vitals), free on Hobby.
         * Both load their scripts and send their beacons to
         * same-origin /_vercel/... paths, so the CSP needs no new
         * host — 'self' already allows them. They render nothing.
         */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
