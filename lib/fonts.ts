import { Noto_Sans_Bengali } from "next/font/google";

/**
 * Bengali typeface for the Bangla face-shape guide (S-5, T-52).
 *
 * Same font-loading pattern the site already uses for Inter +
 * Playfair Display in app/layout.tsx: next/font/google with a CSS
 * variable. The variable is declared here so the Bangla page can
 * apply it without touching app/layout.tsx (owned by Slice C).
 * Apply `notoSansBengali.className` on the Bangla page wrapper —
 * the className carries the font-family; the variable is available
 * for any future use in CSS.
 *
 * Noto Sans Bengali is a variable font, so no weight list is needed
 * (per the next/font docs in node_modules/next/dist/docs). Subsets:
 * "bengali" for the Bengali script, "latin" for the mm figures and
 * Latin product names that appear on the same page.
 */
export const notoSansBengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali", "latin"],
  display: "swap",
});
