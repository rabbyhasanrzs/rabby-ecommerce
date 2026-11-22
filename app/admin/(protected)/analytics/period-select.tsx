"use client";

import { useRouter } from "next/navigation";
import type { AnalyticsPeriod } from "@/lib/admin-analytics";

/**
 * Period select for the Analytics page — client component (S-4, T-49).
 * A change navigates to the same page with ?days=7|14|30; the server
 * component re-reads the data for that period. No useSearchParams
 * (it would need a Suspense boundary) — the current period comes in
 * as a prop.
 */
export default function AnalyticsPeriodSelect({
  days,
}: {
  days: AnalyticsPeriod;
}) {
  const router = useRouter();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/admin/analytics?days=${event.target.value}`);
  }

  return (
    <label className="flex items-center gap-2 font-semibold">
      Period
      <select
        value={String(days)}
        onChange={handleChange}
        className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-base text-text"
      >
        <option value="7">Last 7 days</option>
        <option value="14">Last 14 days</option>
        <option value="30">Last 30 days</option>
      </select>
    </label>
  );
}
