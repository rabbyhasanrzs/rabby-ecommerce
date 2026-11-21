import {
  BadgeCheckIcon,
  HeadsetIcon,
  ShieldCheckIcon,
} from "@/components/icons";
import type { ComponentType } from "react";

/**
 * TrustStrip — Final Approved Design Blueprint, Sections 5 and 7.2 (C-4).
 * Exactly 3 items, everywhere, in the same order:
 * Secure Payment, Quality Assurance, Customer Support.
 * Lens Price / Lens Offer is excluded (not a confirmed business decision).
 * Each item carries one decorative line icon (burgundy accent).
 */
const ITEMS: {
  title: string;
  line: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    title: "Secure Payment",
    line: "Safe payment process.",
    icon: ShieldCheckIcon,
  },
  {
    title: "Quality Assurance",
    line: "Quality-checked products.",
    icon: BadgeCheckIcon,
  },
  {
    title: "Customer Support",
    line: "Reliable customer assistance.",
    icon: HeadsetIcon,
  },
];

export default function TrustStrip() {
  return (
    <section
      aria-label="Why shop with RabbY"
      className="border-y border-border bg-surface"
    >
      <ul className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3 md:px-8">
        {ITEMS.map((item) => (
          <li key={item.title}>
            <item.icon className="mb-2 h-7 w-7 text-action" />
            <p className="text-base font-semibold text-text">{item.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {item.line}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
