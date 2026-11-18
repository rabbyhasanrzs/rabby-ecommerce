"use client";

import Link from "next/link";

/**
 * Route error page — generic user-facing copy only (audit G-M6).
 * No stack traces, no internal details, no error object is rendered.
 */
export default function Error() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">
        Sorry — this page could not be loaded. Please try again, or go back
        to the shop and continue browsing.
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
