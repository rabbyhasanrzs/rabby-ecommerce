/**
 * Face-shape outline icons — hand-drawn, no dependency.
 *
 * Stroke-based, 48x48 viewBox, currentColor, 1.75px stroke, matching
 * the site's other inline line icons. One outline per face type:
 * Oval, Round, Square, Heart, Oblong. Unknown shape names fall back
 * to the oval outline — the component never invents a rating; it only
 * draws the shapes the caller passes in.
 *
 * Animation (subtle, decorative): each outline draws itself in on
 * mount (stroke-dashoffset, via the .face-shape-draw class in
 * globals.css), and the best-fit ("Excellent") icon softly pulses
 * (.face-shape-best). The global prefers-reduced-motion rule in
 * globals.css collapses both animations to their end state, so
 * reduced-motion users see the icons at rest. Icons are decorative
 * (aria-hidden); the rating text next to them is the accessible label.
 */

type FaceShapeIconProps = {
  /** Face-shape name from the data, e.g. "Round" (case-insensitive). */
  shape: string;
  /** True for the best ("Excellent") rating — adds the soft pulse. */
  highlight?: boolean;
  className?: string;
};

function Outline({ children }: { children: React.ReactNode }) {
  return <g className="face-shape-draw">{children}</g>;
}

const SHAPES: Record<string, React.ReactNode> = {
  oval: (
    <Outline>
      <ellipse cx="24" cy="24" rx="13" ry="19" pathLength={1} />
    </Outline>
  ),
  round: (
    <Outline>
      <circle cx="24" cy="24" r="16" pathLength={1} />
    </Outline>
  ),
  square: (
    <Outline>
      <rect x="9" y="9" width="30" height="30" rx="7" pathLength={1} />
    </Outline>
  ),
  heart: (
    <Outline>
      <path
        d="M24 43 C19 38 9 30 9 19 C9 11 15 6 21 8 C22.6 8.6 23.6 9.9 24 11.5 C24.4 9.9 25.4 8.6 27 8 C33 6 39 11 39 19 C39 30 29 38 24 43 Z"
        pathLength={1}
      />
    </Outline>
  ),
  oblong: (
    <Outline>
      <rect x="14" y="4" width="20" height="40" rx="9" pathLength={1} />
    </Outline>
  ),
};

export default function FaceShapeIcon({
  shape,
  highlight = false,
  className,
}: FaceShapeIconProps) {
  const outline = SHAPES[shape.trim().toLowerCase()] ?? SHAPES.oval;
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${highlight ? "face-shape-best" : ""} ${className ?? ""}`}
    >
      {outline}
    </svg>
  );
}
