import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rabby — Sunglasses",
  description:
    "Rabby — a modern, scalable, customer-focused e-commerce website for sunglasses in Bangladesh. Placeholder site: S-0 foundation only.",
  icons: {
    icon: "/favicon.svg",
  },
};

// NOTE: do NOT type this with Next.js LayoutProps<"/">. That helper only
// exists after `next dev` / `next build` / `next typegen` generates the
// route types (next-env.d.ts / .next/types), which are gitignored and do
// not exist in a fresh CI checkout — so `tsc --noEmit` fails there with
// "Cannot find name LayoutProps" (CI run #1). The docs own Root Layout
// example uses { children: React.ReactNode }, which needs no generated
// types and typechecks anywhere.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
