import Link from "next/link";

/**
 * 404 page — generic user-facing copy only (audit G-M6).
 * Unknown product slugs render this page (via notFound()).
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        Page not found
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">
        Sorry — the page you are looking for does not exist or may have
        moved. Please check the address, or browse our sunglasses instead.
      </p>
      <Link
        href="/sunglasses"
        className="mt-8 inline-flex h-12 items-center rounded-md bg-action px-6 text-base font-semibold text-text-inverse transition-colors hover:bg-action-hover active:bg-action-active"
      >
        Browse sunglasses
      </Link>
    </main>
  );
}
