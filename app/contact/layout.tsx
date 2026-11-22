import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

/** S-5, T-57: unique title + description + canonical for this route. */
export const metadata: Metadata = pageMetadata("/contact");

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
