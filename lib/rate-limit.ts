/**
 * In-memory sliding-window rate limiter for API route handlers (S-3, G-C4).
 *
 * Guards the order lookup / cancel routes against reference-guessing
 * (unguessable refs + reference + phone are already in place), the
 * payment webhook against floods, and (S-6, T-61) the guest checkout
 * + bag validation routes and the admin sign-in / MFA actions.
 *
 * Best-effort per server instance: each Node / serverless instance keeps
 * its own Map, so a limit is enforced per instance, not globally across
 * instances. That is fine for the demo-safe stage (low traffic, one
 * instance in practice); a shared store (e.g. Upstash Redis) comes with
 * the real gateway (S-6).
 *
 * Timestamps are pruned lazily on each check (sliding window) and the
 * map is capped at MAX_KEYS entries (oldest key evicted first), so
 * memory stays bounded.
 */

/** Order lookup / cancel: 10 attempts per 10 minutes. */
export const ORDER_RATE_LIMIT = 10;
export const ORDER_RATE_WINDOW_MS = 10 * 60 * 1000;

/** Payment webhook: 20 attempts per minute per IP. */
export const WEBHOOK_RATE_LIMIT = 20;
export const WEBHOOK_RATE_WINDOW_MS = 60 * 1000;

/**
 * Guest checkout: 10 attempts per 10 minutes per IP (S-6, T-61,
 * S6-03). Checkout is the one public route that writes (order +
 * stock decrement in one transaction), so it gets the same budget
 * as the order lookup.
 */
export const CHECKOUT_RATE_LIMIT = 10;
export const CHECKOUT_RATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Bag validation: 30 attempts per minute per IP (S-6, T-61, S6-03).
 * Looser than checkout — the bag page calls it on every load — but
 * still bounded so the route cannot be hammered.
 */
export const BAG_RATE_LIMIT = 30;
export const BAG_RATE_WINDOW_MS = 60 * 1000;

/**
 * Admin sign-in / MFA verify: 10 attempts per 10 minutes per IP
 * (S-6, T-61, S6-05). Server actions have no Request object, so the
 * caller builds the key from next/headers (see login-actions.ts).
 */
export const LOGIN_RATE_LIMIT = 10;
export const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000;

const MAX_KEYS = 10_000;

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds to wait before retrying; 0 when the request is allowed. */
  retryAfterSeconds: number;
}

/**
 * Check one sliding-window budget. Each call counts as one attempt
 * when allowed; a denied call does not consume budget. `limit` must
 * be >= 1.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  if (limit <= 0) {
    return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  const now = Date.now();
  const cutoff = now - windowMs;
  let hits = buckets.get(key);
  if (!hits) {
    if (buckets.size >= MAX_KEYS) {
      // Evict the oldest key (Maps preserve insertion order).
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) {
        buckets.delete(oldest);
      }
    }
    hits = [];
    buckets.set(key, hits);
  }
  const fresh = hits.filter((t) => t > cutoff);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((fresh[0] + windowMs - now) / 1000),
      ),
    };
  }
  fresh.push(now);
  buckets.set(key, fresh);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client identity for rate-limit keys: the first IP in
 * x-forwarded-for (set by Vercel's edge in production), else "unknown".
 */
export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return "unknown";
}

/** Test-only: clear all buckets. Never used in production code. */
export function __resetRateLimits(): void {
  buckets.clear();
}
