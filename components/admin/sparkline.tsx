/**
 * Revenue sparkline (S-4, T-41) — hand-drawn SVG polyline, no chart
 * library. Shows daily revenue for the period passed in; the dots
 * are the days, the line joins them. When there is no revenue at all
 * the chart says so plainly — it never invents numbers.
 */

export interface SparklinePoint {
  date: string;
  revenueBdt: number;
  orders: number;
}

export default function Sparkline({ data }: { data: SparklinePoint[] }) {
  const hasData = data.some(
    (point) => point.revenueBdt > 0 || point.orders > 0,
  );
  if (!hasData) {
    return (
      <p className="py-6 text-center text-text-secondary">No orders yet</p>
    );
  }

  const width = 560;
  const height = 120;
  const padX = 8;
  const padY = 10;
  const max = Math.max(...data.map((point) => point.revenueBdt), 1);
  const stepX =
    data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;

  const points = data.map((point, index) => {
    const x = padX + index * stepX;
    const y = height - padY - (point.revenueBdt / max) * (height - padY * 2);
    return { x, y, label: point.date, revenueBdt: point.revenueBdt };
  });
  const polyline = points
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");

  return (
    <div>
      <svg
        role="img"
        aria-label={`Revenue over the last ${data.length} days, highest day ৳${max.toLocaleString("en-IN")}`}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
      >
        <polyline
          points={polyline}
          fill="none"
          stroke="#7a263a"
          strokeWidth="2"
        />
        {points.map((point) => (
          <circle
            key={point.label}
            cx={point.x}
            cy={point.y}
            r="3"
            fill="#7a263a"
          >
            <title>
              {point.label}: ৳{point.revenueBdt.toLocaleString("en-IN")}
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-text-secondary">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
