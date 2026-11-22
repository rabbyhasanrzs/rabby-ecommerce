/**
 * Site-wide SEO constants + per-page metadata (S-5, T-57).
 *
 * Canonical base is the live Vercel URL only — the custom domain is
 * UNDECIDED, so no other domain is invented here. Every page gets a
 * unique title + description through `pageMetadata()`; route
 * layout.tsx files import their entry instead of duplicating strings.
 *
 * Hero photo (og:image): the owner uploads it AFTER merge to
 * public/images/hero.jpg (see the S-5 owner checklist). The root
 * layout only includes og:image when that file exists at build time,
 * so the URL can never 404 and never carries a literal space.
 */

/** Live production URL — the only canonical base until the owner chooses a custom domain. */
export const SITE_URL = "https://rabby-ecommerce-uhrm.vercel.app";

export const SITE_NAME = "RabbY";

/** Hero photo path (owner upload, after merge). No literal space in the name. */
export const HERO_IMAGE_PATH = "/images/hero.jpg";

/** Absolute hero URL — only use when the file is known to exist (see app/layout.tsx). */
export const HERO_IMAGE_URL = `${SITE_URL}${HERO_IMAGE_PATH}`;

const SITE_DESCRIPTION =
  "RabbY — sunglasses in Bangladesh. Browse sunglasses, check your fit, and check out as a guest. Prices in Bangladeshi Taka (৳).";

interface PageSeo {
  title: string;
  description: string;
}

/**
 * One entry per public route. Titles and descriptions are unique per
 * page and state only what is true: demo values are labelled DEMO
 * where they appear on the page, and the legal pages are drafts until
 * the owner confirms final text.
 */
export const PAGE_SEO: Record<string, PageSeo> = {
  "/help": {
    title: "Help & FAQ",
    description:
      "Answers about delivery, payment, returns, stock, fit, and tracking an order at RabbY — sunglasses in Bangladesh.",
  },
  "/returns": {
    title: "Returns & Exchange",
    description:
      "How returns and exchanges work at RabbY — the proposed 7-day policy in plain steps. Final terms to be confirmed by the owner.",
  },
  "/guide/face-shape": {
    title: "Face-Shape Guide",
    description:
      "Find sunglasses that suit your face shape — shapes, features, recommended frames, and size bands in millimetres.",
  },
  "/guide/face-shape/bn": {
    title: "মুখের আকৃতি অনুযায়ী ফ্রেম গাইড",
    description:
      "আপনার মুখের আকৃতি অনুযায়ী সানগ্লাস খুঁজুন — আকৃতি, বৈশিষ্ট্য, মানানসই ফ্রেম, আর মিলিমিটারে মাপ।",
  },
  "/contact": {
    title: "Contact",
    description:
      "Reach RabbY support — WhatsApp, Messenger, phone, and email. Contact details are shown only once the owner provides verified details.",
  },
  "/privacy": {
    title: "Privacy Policy",
    description:
      "Draft privacy policy for RabbY — what information is collected at guest checkout and how it is used. Owner to confirm final text.",
  },
  "/terms": {
    title: "Terms of Service",
    description:
      "Draft terms of service for RabbY — ordering, payment, delivery, and returns. Owner to confirm final text.",
  },
  "/sunglasses": {
    title: "Sunglasses",
    description:
      "Browse all RabbY sunglasses — search, filter by category, and sort by price. Prices in Bangladeshi Taka (৳).",
  },
  "/bag": {
    title: "Your Bag",
    description:
      "Review the sunglasses in your bag, change quantities, and head to guest checkout at RabbY.",
  },
  "/checkout": {
    title: "Checkout",
    description:
      "Guest checkout at RabbY — no account needed. Cash on Delivery, bKash, Nagad, Rocket, or card (demo configuration).",
  },
  "/orders": {
    title: "Track Your Order",
    description:
      "Track a RabbY order with your order reference and phone number — from Placed to Delivered.",
  },
  "/order/confirmation": {
    title: "Order Confirmation",
    description:
      "Your RabbY order is placed. Keep your order reference to track it or cancel it before it ships.",
  },
  "/about": {
    title: "About",
    description:
      "About RabbY — sunglasses in Bangladesh. Brand content to be provided by the owner.",
  },
};

export function pageSeo(path: string): PageSeo {
  const entry = PAGE_SEO[path];
  if (!entry) {
    throw new Error(`No SEO entry for route ${path}`);
  }
  return entry;
}

/**
 * Full Metadata for a route: unique title + description, canonical
 * URL, and Open Graph + Twitter cards (summary card — no image until
 * the hero photo exists; the root layout adds the large-image card
 * when the hero file is present).
 */
export function pageMetadata(path: string): {
  title: string;
  description: string;
  alternates: { canonical: string };
  openGraph: {
    title: string;
    description: string;
    url: string;
    siteName: string;
    type: "website";
  };
  twitter: {
    card: "summary";
    title: string;
    description: string;
  };
} {
  const { title, description } = pageSeo(path);
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

export { SITE_DESCRIPTION };
