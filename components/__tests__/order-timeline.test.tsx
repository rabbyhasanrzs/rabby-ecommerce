import OrderTimeline from "@/components/order-timeline";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("OrderTimeline", () => {
  it("marks steps before packed as done, packed as current, shipped as upcoming", () => {
    render(<OrderTimeline status="packed" />);

    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(7);
    // placed, confirmed, processing are done; packed is the current step.
    for (const index of [0, 1, 2]) {
      expect(steps[index]).toHaveTextContent("Done");
    }
    expect(steps[3]).toHaveTextContent("Current step");
    // shipped, out for delivery, delivered are upcoming.
    for (const index of [4, 5, 6]) {
      expect(steps[index]).toHaveTextContent("Upcoming");
    }
    expect(screen.getByText("Packed")).toBeInTheDocument();
    expect(screen.getByText("Shipped")).toBeInTheDocument();
  });

  it("highlights the current step", () => {
    render(<OrderTimeline status="confirmed" />);

    const steps = screen.getAllByRole("listitem");
    expect(steps[1]).toHaveTextContent("Current step");
    expect(steps[1]).toHaveTextContent("Confirmed");
  });

  it("shows the cancelled banner for a cancelled order", () => {
    render(
      <OrderTimeline
        status="cancelled"
        events={[
          { fromStatus: null, toStatus: "placed", createdAt: "2026-11-22T00:00:00Z" },
          { fromStatus: "placed", toStatus: "confirmed", createdAt: "2026-11-22T01:00:00Z" },
          { fromStatus: "confirmed", toStatus: "cancelled", createdAt: "2026-11-22T02:00:00Z" },
        ]}
      />,
    );

    expect(screen.getByText("This order was cancelled.")).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem");
    // placed + confirmed were reached, so they show as done.
    expect(steps[0]).toHaveTextContent("Done");
    expect(steps[1]).toHaveTextContent("Done");
    expect(steps[2]).toHaveTextContent("Upcoming");
  });

  it("shows the refunded banner for a refunded order", () => {
    render(<OrderTimeline status="refunded" events={[]} />);

    expect(screen.getByText("This order was refunded.")).toBeInTheDocument();
  });
});
