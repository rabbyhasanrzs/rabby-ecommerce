"use client";

import { CloseIcon, ZoomInIcon } from "@/components/icons";
import { useEffect, useState } from "react";

/**
 * Product photo with a graceful fallback.
 *
 * Product images live at /images/<file> and are NOT in the repo yet —
 * they arrive via web-UI upload. Until then (or if a file is missing),
 * render a plain placeholder block instead of a broken-image icon.
 *
 * `zoomable` (PDP main photo only): hovering the cursor magnifies the
 * photo at the cursor position (2x, transform-origin follows the mouse),
 * and clicking the photo opens a fullscreen lightbox (Escape or the
 * close button dismisses it; pinch-zoom stays available on touch).
 * No zoom or lightbox when there is no photo — the placeholder is
 * inert. Listing cards and thumbnails use the plain, non-zoomable
 * rendering and are unchanged.
 */
export default function ProductImage({
  src,
  alt,
  className,
  zoomable = false,
}: {
  src: string | null;
  alt: string;
  className?: string;
  zoomable?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [zooming, setZooming] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Escape closes the lightbox; the page behind it does not scroll.
  useEffect(() => {
    if (!lightboxOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);

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

  if (!zoomable) {
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

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setOrigin({
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      });
    }
  };

  return (
    <div
      data-testid="photo-zoom"
      className={`group relative overflow-hidden ${className ?? ""}`}
      style={{ cursor: "zoom-in" }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setZooming(true)}
      onMouseLeave={() => setZooming(false)}
      onClick={() => setLightboxOpen(true)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-150 ease-out"
        style={
          zooming
            ? {
                transform: "scale(2)",
                transformOrigin: `${origin.x}% ${origin.y}%`,
              }
            : undefined
        }
      />
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={`View larger photo of ${alt}`}
        className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold text-text shadow-sm hover:border-action"
      >
        <ZoomInIcon className="h-4 w-4" />
        Zoom
      </button>

      {lightboxOpen ? (
        <div
          data-testid="photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo viewer — ${alt}`}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-text/90 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setLightboxOpen(false);
            }
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              // Stop the click reaching the photo container below, which
              // would re-open the lightbox as soon as it closes.
              event.stopPropagation();
              setLightboxOpen(false);
            }}
            autoFocus
            aria-label="Close photo viewer"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-text hover:bg-surface-hover"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            style={{ touchAction: "pinch-zoom" }}
          />
        </div>
      ) : null}
    </div>
  );
}
