# Rabby — E-commerce website for sunglasses

Rabby is a modern, scalable, customer-focused e-commerce website for
sunglasses in Bangladesh, with future international expansion in mind.
The name Rabby is temporary and can be rebranded in future.

**Status: S-0 foundation only.** This repository contains the Next.js
scaffold, the approved design tokens, the global layout (header + footer),
placeholder pages for every sitemap route, CI, and the test harness.
There is no catalogue, no checkout, no payment, and no Vercel project.
The Supabase test project exists but has no tables yet (they land in
S-1). Every page is clearly labelled placeholder demo content. No product
data or prices exist in this repository.

The **Final Approved Design Blueprint** is the single source of truth for
this project. It lives outside this repository (owner's workspace) and is
not pasted into this README. Where this README and the blueprint differ,
the blueprint governs.

## Approved stack

- **Framework:** Next.js (App Router) + React
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4 (`@theme` tokens in `app/globals.css`)
- **Testing:** Vitest + Testing Library (jsdom)
- **CI/CD:** GitHub Actions (lint → typecheck → test → build)
- **Database / Auth / Storage:** PostgreSQL via Supabase — test project
  `rabby-ecommerce-test` exists (Singapore, Free); no tables yet in S-0
  — tables land in S-1 (anon-key read-only client in `lib/supabase/`)
- **Hosting:** Vercel — **not yet set up**

## How to run

```bash
npm install
npm run dev       # development server (http://localhost:3000)
npm run build     # production build
npm start         # serve the production build
npm run lint      # ESLint — must report 0 errors
npm run typecheck # tsc --noEmit
npm test          # Vitest — must pass
```

Requires Node.js 22+ (CI uses Node 22).

## Environment variables

Copy `.env.example` to `.env.local` and fill in values locally.
`.env.example` lists variable **names only** — never put real values or
secrets in the repository. The Supabase service role key is server-only:
it must never be exposed to the browser.

## Project structure

```text
app/                  App Router routes (all S-0 placeholders)
  layout.tsx          Root layout: Inter font, SiteHeader, SiteFooter
  page.tsx            Home — placeholder hero + placeholder sections
  globals.css         Tailwind v4 @theme tokens (Final Approved Design Blueprint, Section 8)
  sunglasses/         Listing (S-1)
  product/[slug]/     Product detail (S-1)
  bag/                Cart page (S-2)
  checkout/           Checkout (S-2)
  order/confirmation/ Order confirmation (S-3)
  orders/             Guest order tracking (S-3)
  help/ returns/      Help & FAQ, Returns & Exchange (S-5)
  guide/face-shape/   Face-shape guide (S-5)
  contact/ about/     Contact, About (S-5)
  privacy/ terms/     Legal pages (S-5)
  admin/              Admin area (S-4)
components/
  site-header.tsx     Sticky header: wordmark, nav, search, Track Order, Bag
  site-footer.tsx     Footer: Shop / Help / About / Contact + payment line (text only)
  trust-strip.tsx     Trust strip — exactly 3 items, same order, everywhere
  placeholder-page.tsx Shared placeholder for every S-0 route
.github/workflows/ci.yml  CI: npm ci → lint → typecheck → test → build
```

## S-0 scope (tasks T-01 to T-07)

Done in S-0: repository + CI (T-01, T-02), design tokens in the Tailwind
theme (T-04), global layout with placeholder content (T-05), environment
configuration names (T-06), test harness (T-07). Not in S-0: Vercel +
Supabase test projects (T-03 — owner sets these up separately).

## Contributing

Work on feature branches with Pull Requests for review. Never modify
`main` directly. No merge without the owner's approval. No product data,
prices, or secrets in any commit.
