"use client";

import { useState } from "react";

/**
 * Product photo with a graceful fallback.
 *
 * Product images live at /images/<file> and are NOT in the repo yet —
 * they arrive via web-UI upload. Until then (or if a file is missing),
 * render a plain placeholder block instead of a broken-image icon.
 */
export default function ProductImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`${alt} — photo coming soon`}
        className={`flex items-center justify-center bg-background-subtle text-base text-text-secondary ${className ?? ""}`}
      >
        Photo coming soon
      </div>
    );
  }

  return (
    // Plain <img>: product photos are plain files under /images, and
    // next/image remote-pattern config is unnecessary for same-origin files.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
