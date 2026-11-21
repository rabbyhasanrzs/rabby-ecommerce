import {
  ORDER_STEPS,
  ORDER_STEP_LABELS,
  type OrderStatusEvent,
} from "@/lib/supabase/orders";

/**
 * Order timeline (S-2, T-24) — the 7-step order workflow in plain words.
 * Steps before the current one are done, the current one is highlighted,
 * later ones are upcoming. A cancelled / failed / returned / refunded
 * order shows a plain banner above the timeline; the timeline still
 * shows the steps the order reached as done.
 */

const TERMINAL_STATUSES: Record<string, string> = {
  cancelled: "This order was cancelled.",
  failed: "This order failed.",
  returned: "This order was returned.",
  refunded: "This order was refunded.",
};

export default function OrderTimeline({
  status,
  events,
}: {
  status: string;
  events?: OrderStatusEvent[];
}) {
  // ORDER_STEPS is a const tuple; indexOf needs a plain string search.
  const currentIndex = (ORDER_STEPS as readonly string[]).indexOf(status);
  const terminalMessage = TERMINAL_STATUSES[status];

  // For a terminal order, the steps reached come from the status events
  // (the last event whose status is one of the 7 steps).
  let reachedIndex = -1;
  if (currentIndex === -1 && events) {
    for (const event of events) {
      const index = (ORDER_STEPS as readonly string[]).indexOf(
        event.toStatus,
      );
      if (index > reachedIndex) {
        reachedIndex = index;
      }
    }
  }

  return (
    <div>
      {terminalMessage ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-border bg-background-subtle px-4 py-3 font-semibold text-text"
        >
          {terminalMessage}
        </p>
      ) : null}
      <ol aria-label="Order status" className="space-y-3">
        {ORDER_STEPS.map((step, index) => {
          const isDone =
            currentIndex === -1 ? index <= reachedIndex : index < currentIndex;
          const isCurrent = index === currentIndex;
          const stateWord = isDone
            ? "Done"
            : isCurrent
              ? "Current step"
              : "Upcoming";
          return (
            <li key={step} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isDone
                    ? "bg-stock-in text-text-inverse"
                    : isCurrent
                      ? "bg-action text-text-inverse"
                      : "bg-background-subtle text-text-secondary"
                }`}
              >
                {isDone ? "✓" : index + 1}
              </span>
              <span className="min-h-7 flex flex-col justify-center">
                <span
                  className={`font-semibold ${
                    isCurrent
                      ? "text-action"
                      : isDone
                        ? "text-text"
                        : "text-text-secondary"
                  }`}
                  {...(isCurrent ? { "aria-current": "step" as const } : {})}
                >
                  {ORDER_STEP_LABELS[step] ?? step}
                </span>
                <span className="text-sm text-text-secondary">
                  {stateWord}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
