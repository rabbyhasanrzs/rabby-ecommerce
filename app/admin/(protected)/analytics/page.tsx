import AnalyticsPeriodSelect from "./period-select";
import {
  getBestSellers,
  getRevenueSeries,
  getSalesSummary,
  type AnalyticsPeriod,
  type RevenuePoint,
} from "@/lib/admin-analytics";
import { formatPriceBdt } from "@/lib/format";
import { requireAdmin } from "@/lib/supabase/admin";
import { connection } from "next/server";

/**
 * Admin Sales & Revenue page — Slice C (S-4, T-49).
 *
 * Server component: requireAdmin() first, then the three analytics
 * reads for the selected period (?days=7|14|30, default 7). Charts
 * are hand-drawn SVG bars — no chart library. Real order data ONLY:
 * an empty period shows "No orders in this period." and the summary
 * reads ৳0 / 0 orders — numbers are never invented. A failed load
 * renders a plain "unavailable" message instead of crashing.
 *
 * Slice B's Dashboard imports getRevenueSeries for its sparkline;
 * this page is the full view of the same data.
 */

function parsePeriod(
  value: string | string[] | undefined,
): AnalyticsPeriod {
  if (value === "14") {
    return 14;
  }
  if (value === "30") {
    return 30;
  }
  return 7;
}

/**
 * One SVG bar chart. `points` are { label, value } in order;
 * `formatValue` renders the value for the hover title and the max
 * label. The y-axis is 0..max; x labels show first / middle / last
 * only so 30 bars stay readable.
 */
function BarChart({
  title,
  points,
  formatValue,
  barClassName,
}: {
  title: string;
  points: { label: string; value: number }[];
  formatValue: (value: number) => string;
  barClassName: string;
}) {
  const width = 600;
  const height = 220;
  const left = 44;
  const right = 10;
  const top = 16;
  const baseline = 184;
  const chartWidth = width - left - right;
  const chartHeight = baseline - top;
  const max = Math.max(0, ...points.map((point) => point.value));
  const slot = points.length > 0 ? chartWidth / points.length : 0;
  const barWidth = Math.max(2, slot * 0.7);
  const middle = points.length > 0 ? points[Math.floor(points.length / 2)] : null;

  return (
    <figure>
      <figcaption className="font-display text-xl font-bold">
        {title}
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title}: highest day ${formatValue(max)}.`}
        className="mt-3 w-full"
      >
        {/* Baseline + max gridline. */}
        <line
          x1={left}
          y1={baseline}
          x2={width - right}
          y2={baseline}
          stroke="var(--color-border)"
          strokeWidth="1"
        />
        <text
          x={left - 6}
          y={top + 4}
          textAnchor="end"
          className="fill-text-secondary text-xs"
        >
          {formatValue(max)}
        </text>
        <line
          x1={left}
          y1={top}
          x2={width - right}
          y2={top}
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text
          x={left - 6}
          y={baseline + 4}
          textAnchor="end"
          className="fill-text-secondary text-xs"
        >
          0
        </text>
        {points.map((point, index) => {
          const barHeight =
            max > 0 ? (point.value / max) * chartHeight : 0;
          const x = left + index * slot + (slot - barWidth) / 2;
          const y = baseline - barHeight;
          return (
            <g key={point.label}>
              <title>{`${point.label}: ${formatValue(point.value)}`}</title>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, point.value > 0 ? 2 : 0)}
                rx={barWidth > 4 ? 2 : 0}
                className={barClassName}
              />
            </g>
          );
        })}
        {/* X labels: first / middle / last only. */}
        {points.length > 0 ? (
          <text
            x={left}
            y={height - 8}
            className="fill-text-secondary text-xs"
          >
            {points[0].label}
          </text>
        ) : null}
        {middle ? (
          <text
            x={left + chartWidth / 2}
            y={height - 8}
            textAnchor="middle"
            className="fill-text-secondary text-xs"
          >
            {middle.label}
          </text>
        ) : null}
        {points.length > 1 ? (
          <text
            x={width - right}
            y={height - 8}
            textAnchor="end"
            className="fill-text-secondary text-xs"
          >
            {points[points.length - 1].label}
          </text>
        ) : null}
      </svg>
    </figure>
  );
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Request-time rendering first: requireAdmin() reads the session
  // with supabase.auth.getUser(), and @supabase/auth-js checks the
  // token expiry with Date.now() on every such call — Next 16 (Cache
  // Components) flags that as an unstable value during prerendering
  // ("Route ... encountered the unstable value `Date.now()` while
  // prerendering"). Every other admin page already does this; this
  // page was the only one missing it (with Settings).
  await connection();
  await requireAdmin();
  const days = parsePeriod((await searchParams).days);

  let series: RevenuePoint[] = [];
  let bestSellers: Awaited<ReturnType<typeof getBestSellers>> = [];
  let summary = { revenueBdt: 0, orders: 0, avgOrderBdt: 0 };
  let loadError = false;
  try {
    [series, bestSellers, summary] = await Promise.all([
      getRevenueSeries(days),
      getBestSellers(days),
      getSalesSummary(days),
    ]);
  } catch {
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text md:text-4xl">
            Sales &amp; Revenue
          </h1>
          <p className="mt-2 text-text-secondary">
            Real orders only — cancelled, failed and refunded orders are
            not counted.
          </p>
        </div>
        <AnalyticsPeriodSelect days={days} />
      </div>

      {loadError ? (
        <p
          role="status"
          className="rounded-md border border-border bg-surface px-4 py-3"
        >
          Sales data is unavailable right now. Please try again.
        </p>
      ) : (
        <>
          {/* Summary totals. */}
          <section
            aria-label="Summary totals"
            className="grid gap-4 sm:grid-cols-3"
          >
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-text-secondary">
                Revenue
              </p>
              <p className="mt-1 font-display text-3xl font-bold">
                {formatPriceBdt(summary.revenueBdt)}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Last {days} days
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-text-secondary">
                Orders
              </p>
              <p className="mt-1 font-display text-3xl font-bold">
                {summary.orders}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Last {days} days
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-text-secondary">
                Average order
              </p>
              <p className="mt-1 font-display text-3xl font-bold">
                {formatPriceBdt(summary.avgOrderBdt)}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Per order, last {days} days
              </p>
            </div>
          </section>

          {summary.orders === 0 ? (
            <p
              role="status"
              className="rounded-md border border-border bg-surface px-4 py-3"
            >
              No orders in this period.
            </p>
          ) : (
            <>
              <section
                aria-label="Revenue and orders over time"
                className="grid gap-6 lg:grid-cols-2"
              >
                <div className="rounded-lg border border-border bg-surface p-4 sm:p-6">
                  <BarChart
                    title="Revenue over time"
                    points={series.map((point) => ({
                      label: point.date,
                      value: point.revenueBdt,
                    }))}
                    formatValue={(value) => formatPriceBdt(value)}
                    barClassName="fill-action"
                  />
                </div>
                <div className="rounded-lg border border-border bg-surface p-4 sm:p-6">
                  <BarChart
                    title="Orders over time"
                    points={series.map((point) => ({
                      label: point.date,
                      value: point.orders,
                    }))}
                    formatValue={(value) => `${value} order${value === 1 ? "" : "s"}`}
                    barClassName="fill-text-secondary"
                  />
                </div>
              </section>

              <section
                aria-labelledby="best-sellers-heading"
                className="rounded-lg border border-border bg-surface p-4 sm:p-6"
              >
                <h2
                  id="best-sellers-heading"
                  className="font-display text-xl font-bold"
                >
                  Best sellers
                </h2>
                {bestSellers.length === 0 ? (
                  <p className="mt-2 text-text-secondary">
                    No orders in this period.
                  </p>
                ) : (
                  <table className="mt-4 w-full text-left">
                    <thead>
                      <tr className="border-b border-border text-sm text-text-secondary">
                        <th scope="col" className="py-2 pr-2 font-semibold">
                          Product
                        </th>
                        <th
                          scope="col"
                          className="py-2 pr-2 text-right font-semibold"
                        >
                          Sold
                        </th>
                        <th scope="col" className="py-2 text-right font-semibold">
                          Revenue
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {bestSellers.map((item) => (
                        <tr
                          key={item.slug}
                          className="border-b border-border last:border-0"
                        >
                          <td className="py-2 pr-2 font-semibold">
                            {item.name}
                          </td>
                          <td className="py-2 pr-2 text-right">
                            {item.qty}
                          </td>
                          <td className="py-2 text-right">
                            {formatPriceBdt(item.revenueBdt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
