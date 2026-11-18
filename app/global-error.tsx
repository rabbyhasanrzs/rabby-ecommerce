"use client";

/**
 * Global error page — generic user-facing copy only (audit G-M6).
 * No stack traces, no internal details. This page replaces the whole
 * document (including the header/footer) when the root layout fails,
 * so it renders its own minimal shell. The hex values below are a
 * deliberate exception to the no-hard-coded-hex rule: this shell runs
 * without the root layout, so the @theme tokens may not be loaded —
 * the values are the premium palette tokens (Warm Ivory #F7F4EF,
 * Charcoal #171717, secondary #5C5C5C, Deep Burgundy #7A263A).
 */
export default function GlobalError() {
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col bg-[#f7f4ef] font-sans text-[#171717] antialiased">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 md:px-8">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Something went wrong
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#5c5c5c]">
            Sorry — RabbY could not be loaded. Please try again in a moment.
          </p>
          {/*
            Plain <a> on purpose: global-error renders when the root
            layout (and its router context) has failed, so next/link
            cannot be relied on here.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="mt-8 inline-flex h-12 items-center rounded-md bg-[#7a263a] px-6 text-base font-semibold text-white"
          >
            Go to the homepage
          </a>
        </main>
      </body>
    </html>
  );
}
