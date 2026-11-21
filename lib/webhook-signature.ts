/**
 * Generic HMAC-SHA256 webhook signature verification (S-3, T-32).
 *
 * Uses Web Crypto (crypto.subtle) so it works in the Next.js route
 * runtime. No provider-specific logic: no provider is wired in S-3
 * (demo-safe mode) — a real gateway later plugs its own secret +
 * header into this helper.
 *
 * The signature is the hex HMAC-SHA256 of the RAW request body,
 * optionally prefixed with "sha256=". Comparison is constant-time
 * (equal-length buffers compared byte by byte); the function never
 * throws — any malformed input simply fails verification.
 */

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) {
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function verifyWebhookSignature(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
}): Promise<boolean> {
  const { rawBody, signature, secret } = input;
  if (!secret || !signature) {
    return false;
  }
  const trimmed = signature.trim();
  const hex = trimmed.startsWith("sha256=")
    ? trimmed.slice("sha256=".length)
    : trimmed;
  const expected = hexToBytes(hex);
  if (!expected) {
    return false;
  }
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(rawBody),
    );
    return timingSafeEqual(new Uint8Array(mac), expected);
  } catch {
    return false;
  }
}
