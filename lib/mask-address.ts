/**
 * Mask a free-text delivery address for the track-order page (S-6, D-S6-6).
 *
 * Standard tracking-page behaviour: the detailed part of the address
 * (house / road / flat) is hidden, the area + city stay visible so the
 * customer can recognise the delivery destination.
 *
 * Rule — split on commas, trim each segment, drop empty segments:
 *   - empty / blank input            -> ""        (render nothing)
 *   - one segment only               -> "•••"
 *   - two segments                   -> "•••, <last>"
 *   - three or more segments         -> "•••, <second-last>, <last>"
 *   e.g. "House 12, Road 5, Dhanmondi, Dhaka" -> "•••, Dhanmondi, Dhaka"
 *
 * The first segment is ALWAYS masked, even for a two-segment address,
 * so a masked address never shows the full address unmasked. Every
 * masked segment collapses into a single "•••" (the count of hidden
 * segments is not leaked). The delivery zone is a separate field and
 * is NOT masked — this function only ever sees the free-text address.
 *
 * Pure function, no imports: safe to use from the client track page
 * and from unit tests.
 */
export function maskDeliveryAddress(address: string): string {
  const segments = address
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return "";
  }
  if (segments.length === 1) {
    return "•••";
  }
  // Keep at most the last two segments, but always mask the first one:
  // a two-segment address keeps only its last segment visible.
  const visibleCount = Math.min(2, segments.length - 1);
  const visible = segments.slice(-visibleCount);
  return ["•••", ...visible].join(", ");
}
