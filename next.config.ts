import type { NextConfig } from "next";

/**
 * Security headers — audit L-H1 (S-1 gate).
 *
 * Content-Security-Policy notes:
 * - `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'` are
 *   exceptions Next.js itself requires: Next injects inline bootstrap
 *   scripts and inline styles at runtime, and there is no nonce plumbing
 *   for them in this setup. Everything else is locked to 'self' plus the
 *   named hosts below — no other inline code, no third-party scripts.
 * - Fonts come from Google Fonts (Playfair Display + Inter via
 *   next/font/google, which fetches from fonts.googleapis.com /
 *   fonts.gstatic.com at build time and serves the files locally).
 * - `connect-src https://*.supabase.co` covers the Supabase project
 *   host (the anon-key client talks to https://<project-ref>.supabase.co).
 *   A wildcard subdomain is used deliberately: the project ref is an env
 *   value that is absent in CI builds, so the header must not depend on
 *   it at build time. No other API host is allowed.
 * - `img-src` allows the same Supabase host for future Supabase Storage
 *   product photos; today photos live at /images (same origin, 'self').
 * - `frame-ancestors 'none'` (no embedding anywhere) and `object-src
 *   'none'` (no plugins).
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
