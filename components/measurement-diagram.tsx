import type { ProductMeasurements } from "@/lib/supabase/catalog";

/**
 * Measurement diagram — Lunettes-style line drawing, drawn from scratch
 * (not copied from any reference site): a front frame view and a side
 * temple view with dashed dimension arrows.
 *
 * The drawing itself is schematic — it is NOT to scale. Only the labels
 * carry the product's real numbers, taken from product_measurements
 * (lens_width_mm, bridge_mm, temple_mm, frame_width_mm,
 * lens_height_mm). A missing value renders as "—", matching the text
 * list below it. When measurements is null the diagram renders nothing.
 *
 * Palette: Deep Burgundy #7A263A is the single accent (dimension arrows
 * and hinge screws); Charcoal #171717 is the frame ink; #5C5C5C is the
 * secondary text. The text list in the PDP stays as the accessible
 * alternative; the SVG itself carries role="img" with an aria-label
 * summarising the dimensions.
 */

const INK = "#171717";
const ACCENT = "#7A263A";
const MUTED = "#5C5C5C";

function dim(value: number | null): string {
  return value === null || value === undefined ? "—" : `${value} mm`;
}

export default function MeasurementDiagram({
  measurements,
}: {
  measurements: ProductMeasurements | null;
}) {
  if (!measurements) {
    return null;
  }

  const {
    frame_width_mm,
    lens_width_mm,
    bridge_mm,
    lens_height_mm,
    temple_mm,
  } = measurements;

  const summaryParts: string[] = [];
  if (frame_width_mm !== null && frame_width_mm !== undefined) {
    summaryParts.push(`frame width ${frame_width_mm} mm`);
  }
  if (lens_width_mm !== null && lens_width_mm !== undefined) {
    summaryParts.push(`lens ${lens_width_mm} mm`);
  }
  if (bridge_mm !== null && bridge_mm !== undefined) {
    summaryParts.push(`bridge ${bridge_mm} mm`);
  }
  if (lens_height_mm !== null && lens_height_mm !== undefined) {
    summaryParts.push(`lens height ${lens_height_mm} mm`);
  }
  if (temple_mm !== null && temple_mm !== undefined) {
    summaryParts.push(`temple ${temple_mm} mm`);
  }
  const ariaLabel =
    summaryParts.length > 0
      ? `Measurement diagram: ${summaryParts.join(", ")}.`
      : "Measurement diagram: no measurements listed.";

  return (
    <div className="rounded-md border border-border bg-surface p-3 sm:p-4">
      <svg
        viewBox="0 0 640 250"
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full"
      >
        <defs>
          <marker
            id="measurement-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={ACCENT} />
          </marker>
        </defs>

        {/* ---- Front view: frame width (hinge to hinge) ---- */}
        <line
          x1="55"
          y1="64"
          x2="315"
          y2="64"
          stroke={ACCENT}
          strokeWidth="1.5"
          strokeDasharray="5 4"
          markerStart="url(#measurement-arrow)"
          markerEnd="url(#measurement-arrow)"
        />
        <text
          x="185"
          y="50"
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill={INK}
        >
          {`Frame width ${dim(frame_width_mm)}`}
        </text>

        {/* ---- Front view: frame ---- */}
        {/* Temple stubs */}
        <line x1="51" y1="104" x2="32" y2="102" stroke={INK} strokeWidth="2.5" />
        <line
          x1="319"
          y1="104"
          x2="338"
          y2="102"
          stroke={INK}
          strokeWidth="2.5"
        />
        {/* Lenses */}
        <rect
          x="55"
          y="90"
          width="100"
          height="75"
          rx="26"
          fill="none"
          stroke={INK}
          strokeWidth="2.5"
        />
        <rect
          x="215"
          y="90"
          width="100"
          height="75"
          rx="26"
          fill="none"
          stroke={INK}
          strokeWidth="2.5"
        />
        {/* Bridge */}
        <path
          d="M155,104 Q185,94 215,104"
          fill="none"
          stroke={INK}
          strokeWidth="2.5"
        />
        {/* Hinge screws */}
        <circle cx="55" cy="104" r="3.5" fill={ACCENT} />
        <circle cx="315" cy="104" r="3.5" fill={ACCENT} />

        {/* ---- Front view: lens width + bridge ---- */}
        <line
          x1="55"
          y1="185"
          x2="215"
          y2="185"
          stroke={ACCENT}
          strokeWidth="1.5"
          strokeDasharray="5 4"
          markerStart="url(#measurement-arrow)"
          markerEnd="url(#measurement-arrow)"
        />
        <line
          x1="155"
          y1="180"
          x2="155"
          y2="190"
          stroke={ACCENT}
          strokeWidth="1.5"
        />
        <text
          x="105"
          y="203"
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill={INK}
        >
          {`Lens ${dim(lens_width_mm)}`}
        </text>
        <text
          x="185"
          y="203"
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill={INK}
        >
          {`Bridge ${dim(bridge_mm)}`}
        </text>

        {/* ---- Front view: lens height ---- */}
        <line
          x1="338"
          y1="90"
          x2="338"
          y2="165"
          stroke={ACCENT}
          strokeWidth="1.5"
          strokeDasharray="5 4"
          markerStart="url(#measurement-arrow)"
          markerEnd="url(#measurement-arrow)"
        />
        <text x="348" y="122" fontSize="12" fill={INK}>
          Height
        </text>
        <text x="348" y="138" fontSize="12" fontWeight="600" fill={INK}>
          {dim(lens_height_mm)}
        </text>

        {/* ---- Side view: lens edge + temple arm ---- */}
        <rect
          x="428"
          y="90"
          width="12"
          height="75"
          rx="6"
          fill="none"
          stroke={INK}
          strokeWidth="2.5"
        />
        <path
          d="M440,100 L580,92"
          fill="none"
          stroke={INK}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M580,92 q14,0 12,16"
          fill="none"
          stroke={INK}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* ---- Side view: temple length ---- */}
        <line
          x1="440"
          y1="185"
          x2="592"
          y2="185"
          stroke={ACCENT}
          strokeWidth="1.5"
          strokeDasharray="5 4"
          markerStart="url(#measurement-arrow)"
          markerEnd="url(#measurement-arrow)"
        />
        <text
          x="516"
          y="203"
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill={INK}
        >
          {`Temple ${dim(temple_mm)}`}
        </text>

        {/* ---- Captions ---- */}
        <text x="185" y="232" textAnchor="middle" fontSize="12" fill={MUTED}>
          Front view
        </text>
        <text x="516" y="232" textAnchor="middle" fontSize="12" fill={MUTED}>
          Side view
        </text>
      </svg>
    </div>
  );
}
