/**
 * TrustStrip — Final Approved Design Blueprint, Sections 5 and 7.2 (C-4).
 * Exactly 3 items, everywhere, in the same order:
 * Secure Payment, Quality Assurance, Customer Support.
 * Lens Price / Lens Offer is excluded (not a confirmed business decision).
 */
const ITEMS = [
  {
    title: "Secure Payment",
    line: "Safe payment process.",
  },
  {
    title: "Quality Assurance",
    line: "Quality-checked products.",
  },
  {
    title: "Customer Support",
    line: "Reliable customer assistance.",
  },
] as const;

export default function TrustStrip() {
  return (
    <section
      aria-label="Why shop with RabbY"
      className="border-y border-border bg-surface"
    >
      <ul className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3 md:px-8">
        {ITEMS.map((item) => (
          <li key={item.title}>
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
