import HomeCatalogueSections from "@/components/home-catalogue-sections";
import TrustStrip from "@/components/trust-strip";
import { resolveHeroPhoto } from "@/lib/hero-photo";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

/**
 * Home — S-5 build-out (replaces the S-0 placeholder).
 *
 * Hero (headline + subcopy + "Shop sunglasses" CTA + hero image),
 * TrustStrip, Shop by category + New arrivals from the live
 * catalogue, Find your fit teaser, FAQ teaser. No "Placeholder"
 * badges anywhere. One H1 (the hero headline), section headings H2.
 *
 * Hero copy claims nothing that does not exist: no prices, no stock,
 * no features. The hero photo is optional — resolveHeroPhoto()
 * checks for public/images/hero.jpg (or .webp) at render time; when
 * the file is absent (before the owner uploads it via the GitHub web
 * UI) the hero renders as a styled typographic hero with NO <img>
 * tag and no error text.
 */
export default function Home() {
  const heroPhoto = resolveHeroPhoto();

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero: image above copy on mobile, copy left / image right on desktop. */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          {heroPhoto ? (
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg border border-border bg-background-subtle shadow-sm lg:order-2">
              <Image
                src={heroPhoto}
                alt="Woman wearing white sunglasses outdoors in bright sunlight"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          ) : null}
          <div className={heroPhoto ? "lg:order-1" : ""}>
            <h1 className="max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight text-text md:text-5xl">
              Find sunglasses that fit you.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-text-secondary">
              Browse sunglasses in Bangladeshi Taka (৳), with delivery
              across Bangladesh. Pick a frame you like, check the fit,
              and order as a guest — no account needed.
            </p>
            <Link
              href="/sunglasses"
              className="mt-8 inline-flex h-12 items-center rounded-md bg-action px-6 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active"
            >
              Shop sunglasses
            </Link>
          </div>
        </div>
      </section>

      <TrustStrip />

      <Suspense
        fallback={
          <p className="mx-auto w-full max-w-7xl px-4 py-12 text-base text-text-secondary md:px-8">
            Loading sunglasses…
          </p>
        }
      >
        <HomeCatalogueSections />
      </Suspense>

      {/* Find your fit teaser → Face-Shape Guide. */}
      <section
        aria-label="Find your fit"
        className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8"
      >
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm md:p-8">
          <h2 className="font-display text-2xl font-bold tracking-tight text-text md:text-3xl">
            Find your fit
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-text-secondary">
            Not sure which frame suits your face? The face-shape guide
            shows which shapes work for round, oval, square, heart, and
            oblong faces, with frame sizes in millimetres.
          </p>
          <Link
            href="/guide/face-shape"
            className="mt-6 inline-flex min-h-11 items-center rounded-md border border-border px-6 py-3 text-base font-semibold text-text transition-colors hover:border-action hover:text-action"
          >
            Open the face-shape guide
          </Link>
        </div>
      </section>

      {/* FAQ teaser → Help & FAQ. */}
      <section
        aria-label="Frequently asked questions"
        className="mx-auto w-full max-w-7xl px-4 pb-12 md:px-8"
      >
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm md:p-8">
          <h2 className="font-display text-2xl font-bold tracking-tight text-text md:text-3xl">
            Frequently asked questions
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-text-secondary">
            Delivery times and fees, payment methods, returns, and how
            to track your order — answered in the Help &amp; FAQ page.
          </p>
          <Link
            href="/help"
            className="mt-6 inline-flex min-h-11 items-center rounded-md border border-border px-6 py-3 text-base font-semibold text-text transition-colors hover:border-action hover:text-action"
          >
            Visit Help &amp; FAQ
          </Link>
        </div>
      </section>
    </main>
  );
}
