import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

/**
 * S-5, T-57: unique title + description + canonical for this route.
 * S-6, T-61, S6-10: noindex — the confirmation is a guest-flow page
 * (it shows a customer's own order) and must not be indexed. The
 * page is a client component, so the metadata lives here, in the
 * server layout.
 */
export const metadata: Metadata = {
  ...pageMetadata("/order/confirmation"),
  robots: { index: false, follow: false },
};

export default function OrderConfirmationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
