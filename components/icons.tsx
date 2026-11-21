/**
 * Inline SVG line icons — hand-drawn, no dependency.
 *
 * Stroke-based, 24x24 viewBox, currentColor, 1.75px stroke, matching
 * the prototype's professional line-icon style. Icons are decorative
 * (aria-hidden); any icon-only button using them must carry its own
 * aria-label. No hard-coded colours — the parent sets text colour.
 */

type IconProps = {
  className?: string;
};

function Svg({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Magnifier — header search. */
export function SearchIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  );
}

/** Shopping bag — header Bag link. */
export function BagIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </Svg>
  );
}

/** Shield with check — Secure Payment trust item. */
export function ShieldCheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

/** Checked seal — Quality Assurance trust item. */
export function BadgeCheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8.5 12.5 11 15l4.5-5.5" />
    </Svg>
  );
}

/** Headphones — Customer Support trust item. */
export function HeadsetIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </Svg>
  );
}

/** Magnifier with plus — photo zoom affordance. */
export function ZoomInIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </Svg>
  );
}

/** X — lightbox close button. */
export function CloseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}
