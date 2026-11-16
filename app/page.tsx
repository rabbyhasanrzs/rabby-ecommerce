import TrustStrip from "@/components/trust-strip";
import Link from "next/link";

/**
 * Home — S-0 placeholder only.
 * The shop-led hero, categories, new arrivals, fit help, and FAQ land
 * in S-1. No product cards, no prices, no cart logic in S-0.
 * Every placeholder is clearly labelled as demo content.
 */
const PLACEHOLDER_SECTIONS = [
  {
    title: "Shop by category",
    body: "Category tiles (Sunglasses, Eyeglasses, Polarized, Kids, Accessories) land in S-1 with the demo catalog.",
  },
  {
    title: "New arrivals",
    body: "New arrivals with prices land in S-1. No products exist yet — the demo catalog is built in S-1.",
  },
  {
    title: "Find your fit",
    body: "Face-shape guide and fit help land in S-1 / S-5. Measurements and face-shape ratings come with the demo catalog.",
  },
  {
    title: "Frequently asked questions",
    body: "Top questions and answers land in S-5 (Help & Legal).",
  },
] as const;

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-8 md:py-24">
        <p className="mb-4 inline-block rounded bg-background-subtle px-3 py-1 text-sm font-semibold text-text-secondary">
          Placeholder — demo content, not real products
        </p>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-text md:text-5xl">
          Placeholder hero
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">
          The shop-led hero lands in S-1: new arrivals and best sellers with
          prices. Nothing on this page is a real product, price, or offer.
        </p>
        <Link
          href="/sunglasses"
          className="mt-8 inline-flex h-12 items-center rounded-md bg-action px-6 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active"
        >
          Shop sunglasses
        </Link>
      </section>

      <TrustStrip />

      {PLACEHOLDER_SECTIONS.map((section) => (
        <section
          key={section.title}
          className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8"
        >
          <p className="mb-2 inline-block rounded bg-background-subtle px-3 py-1 text-sm font-semibold text-text-secondary">
            Placeholder — demo content, not real products
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-text md:text-3xl">
            {section.title}
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-text-secondary">
            {section.body}
          </p>
        </section>
      ))}
    </main>
  );
}
