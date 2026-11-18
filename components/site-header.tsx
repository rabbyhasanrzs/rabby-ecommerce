import Link from "next/link";

const NAV_LINKS = [
  { href: "/sunglasses", label: "Sunglasses" },
  { href: "/sunglasses?view=new-arrivals", label: "New Arrivals" },
  { href: "/sunglasses?view=best-sellers", label: "Best Sellers" },
  { href: "/help", label: "Help" },
] as const;

/**
 * Site header — Final Approved Design Blueprint, Sections 6.2 and 7.1.
 * Sticky header: wordmark, nav, search, Track Order, Bag.
 * Search submits to /sunglasses (S-1 product search, FR-02).
 * The bag count is a static placeholder (0) until the cart lands in S-2.
 * Wordmark "RabbY" (owner decision 2026-11-18), Playfair Display.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 md:h-16 md:px-8">
        <Link
          href="/"
          className="shrink-0 font-display text-2xl font-bold tracking-tight text-text"
          aria-label="RabbY — home"
        >
          RabbY
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-6 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-base text-text hover:text-action"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3 md:gap-4">
          <form
            action="/sunglasses"
            method="get"
            role="search"
            className="hidden w-full max-w-xs sm:flex"
          >
            <label className="w-full">
              <span className="sr-only">Search sunglasses</span>
              <input
                type="search"
                name="search"
                placeholder="Search sunglasses…"
                aria-label="Search sunglasses"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-base text-text placeholder:text-text-secondary"
              />
            </label>
          </form>

          <Link
            href="/orders"
            className="hidden shrink-0 text-base text-text hover:text-action sm:block"
          >
            Track Order
          </Link>

          <Link
            href="/bag"
            className="flex shrink-0 items-center gap-1.5 text-base text-text hover:text-action"
            aria-label="Bag, 0 items (placeholder)"
          >
            Bag
            <span
              aria-hidden="true"
              className="flex h-6 min-w-6 items-center justify-center rounded-full bg-action px-1.5 text-sm font-semibold text-text-inverse"
            >
              0
            </span>
          </Link>

          <details className="relative md:hidden">
            <summary className="cursor-pointer list-none rounded-md border border-border px-3 py-2 text-base text-text">
              Menu
            </summary>
            <nav
              aria-label="Mobile"
              className="absolute right-0 top-12 flex w-56 flex-col border border-border bg-surface p-2 shadow-md"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded px-3 py-2.5 text-base text-text hover:bg-surface-hover"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/orders"
                className="rounded px-3 py-2.5 text-base text-text hover:bg-surface-hover"
              >
                Track Order
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
