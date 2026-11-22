/**
 * Admin session timeout (S-6 follow-up, D-S6-1) — pure helpers, no
 * server-only imports, so the proxy, the login server actions, the
 * login page, the client fetch callers, and the tests can all share
 * them.
 *
 * Rules: an admin session ends after 30 minutes without activity
 * (idle) or 8 hours after sign-in even if active (absolute). The
 * clock starts at successful sign-in — the login actions set the
 * cookie then, including after the MFA code step — and the proxy
 * refreshes last-activity on every passing /admin/* or /api/admin/*
 * request.
 *
 * Honest note on the cookie: it is NOT signed. No server secret
 * exists for it, and the timeout is a hygiene control, not an
 * authorization boundary — the real gate stays requireAdmin() (role
 * + MFA, S-4/S-6). A bearer who tampers with the cookie can only
 * extend their own already-authorized session; they cannot gain
 * access they do not already have, and the Supabase auth cookies
 * are still required alongside it.
 *
 * Do NOT rely on the Supabase dashboard JWT-expiry setting for this:
 * the refresh token auto-renews, so a dashboard expiry alone never
 * logs anyone out. This cookie is enforced app-side in proxy.ts.
 */

export const ADMIN_SESSION_IDLE_MINUTES = 30;
export const ADMIN_SESSION_ABSOLUTE_HOURS = 8;
export const ADMIN_SESSION_COOKIE_NAME = "admin-session";

export const ADMIN_SESSION_IDLE_MS =
  ADMIN_SESSION_IDLE_MINUTES * 60 * 1000;
export const ADMIN_SESSION_ABSOLUTE_MS =
  ADMIN_SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000;

/** Plain-words messages shown on /admin/login after a timeout. */
export const ADMIN_SESSION_TIMEOUT_MESSAGES = {
  idle: "Your session ended after 30 minutes without activity. Please sign in again.",
  absolute: "Your session ended after 8 hours. Please sign in again.",
} as const;

export type AdminSessionTimeoutKind = "idle" | "absolute";
export type AdminSessionStatus = "ok" | AdminSessionTimeoutKind;

/**
 * Cookie value: s = sign-in time (ms since epoch), a = last
 * activity (ms since epoch). Both are needed — the idle limit runs
 * from `a`, the absolute limit from `s`.
 */
export interface AdminSessionValue {
  s: number;
  a: number;
}

/** Cookie flags shared by the proxy and the login actions. */
export const ADMIN_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: ADMIN_SESSION_ABSOLUTE_MS / 1000,
};

/** Fresh value: the clock starts now, for both limits. */
export function buildAdminSessionValue(nowMs: number): AdminSessionValue {
  return { s: nowMs, a: nowMs };
}

export function serializeAdminSessionValue(
  value: AdminSessionValue,
): string {
  return JSON.stringify(value);
}

/**
 * Parse a cookie value. Returns null for a missing, malformed, or
 * out-of-shape value — callers treat that as expired (fail closed),
 * never as a valid session.
 */
export function parseAdminSessionValue(
  raw: string | null | undefined,
): AdminSessionValue | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const { s, a } = parsed as { s?: unknown; a?: unknown };
  if (
    typeof s !== "number" ||
    typeof a !== "number" ||
    !Number.isFinite(s) ||
    !Number.isFinite(a) ||
    s <= 0 ||
    a <= 0 ||
    s > a
  ) {
    return null;
  }
  return { s, a };
}

/**
 * Check a cookie value against both limits at `nowMs`. The
 * absolute limit is checked first: a session that hit both limits
 * ended because of the 8-hour cap. An unparseable value counts as
 * idle-expired (fail closed). Boundaries are inclusive: exactly
 * 30:00 idle or exactly 8:00 since sign-in is expired.
 */
export function checkSessionTimeout(
  raw: string | null | undefined,
  nowMs: number,
): AdminSessionStatus {
  const parsed = parseAdminSessionValue(raw);
  if (!parsed) {
    return "idle";
  }
  if (nowMs - parsed.s >= ADMIN_SESSION_ABSOLUTE_MS) {
    return "absolute";
  }
  if (nowMs - parsed.a >= ADMIN_SESSION_IDLE_MS) {
    return "idle";
  }
  return "ok";
}

/**
 * Refresh last-activity to `nowMs`, keeping the original sign-in
 * time so the absolute limit still runs from sign-in. Returns null
 * for an unparseable value.
 */
export function refreshAdminSessionValue(
  raw: string,
  nowMs: number,
): string | null {
  const parsed = parseAdminSessionValue(raw);
  if (!parsed) {
    return null;
  }
  return serializeAdminSessionValue({ s: parsed.s, a: nowMs });
}

/** Plain-words timeout message for a ?session= value, else null. */
export function getSessionTimeoutMessage(
  kind: string | null | undefined,
): string | null {
  if (kind === "idle" || kind === "absolute") {
    return ADMIN_SESSION_TIMEOUT_MESSAGES[kind];
  }
  return null;
}

/**
 * Read the timeout kind out of a 401 JSON body from /api/admin/*,
 * for the client fetch callers. Anything else (no session field,
 * unknown value, unparseable body) is not a timeout.
 */
export function getSessionTimeoutKind(
  body: unknown,
): AdminSessionTimeoutKind | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const session = (body as { session?: unknown }).session;
  if (session === "idle" || session === "absolute") {
    return session;
  }
  return null;
}
