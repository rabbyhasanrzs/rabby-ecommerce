import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

/** S-5, T-57: unique title + description + canonical for this route.
 * S-6, T-61, S6-10: noindex — track order is a guest-flow page (it
 * shows a customer's own order) and must not be indexed. */
export const metadata: Metadata = {
  ...pageMetadata("/orders"),
  robots: { index: false, follow: false },
};

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
