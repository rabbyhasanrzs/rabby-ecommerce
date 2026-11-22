/**
 * Admin order-status targets (S-6 follow-up, D-S6-3 — free movement).
 *
 * Pure module — no server-only imports — so it can be used by the
 * server data layer, and unit-tested directly, without pulling in
 * the Supabase admin client (admin-data.ts must never be imported
 * into a client component or test).
 *
 * RULE: from any current status the admin may jump to ANY target the
 * server accepts — one jump (Placed -> Delivered) or step by step,
 * their choice. Backward jumps (e.g. Shipped -> Packed) are allowed
 * by design: the admin may correct a mistaken step, and every move
 * is recorded in order_status_events, so nothing is hidden.
 *
 * The list is exactly the set the server accepts: the Zod enum in
 * admin-schemas (orderStatusUpdateSchema) and the
 * admin_update_order_status RPC (migration 0005) both accept any
 * valid status and only reject invalid status strings and moves out
 * of the terminal statuses (cancelled / failed / refunded).
 *
 * Why each exclusion:
 * - "placed" is never a target: it is the initial state, not in the
 *   Zod enum, so the API rejects it.
 * - "failed" is a system status (payment failure), not in the Zod
 *   enum, so the API rejects it.
 * - Cancel is offered only before shipping (same rule as the
 *   customer cancel): once an order has shipped it can no longer be
 *   cancelled, only returned/refunded.
 * - Delivered / Returned are post-fulfilment, so only the return
 *   path applies: Delivered -> Returned, Returned -> Refunded.
 */

export const ALLOWED_TARGET_STATUSES: Record<string, string[]> = {
  placed: [
    "confirmed",
    "processing",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ],
  confirmed: [
    "processing",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ],
  processing: [
    "confirmed",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ],
  packed: [
    "confirmed",
    "processing",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ],
  shipped: ["confirmed", "processing", "packed", "out_for_delivery", "delivered"],
  out_for_delivery: ["confirmed", "processing", "packed", "shipped", "delivered"],
  delivered: ["returned"],
  returned: ["refunded"],
  cancelled: [],
  failed: [],
  refunded: [],
};

export function allowedTargetStatuses(status: string): string[] {
  return ALLOWED_TARGET_STATUSES[status] ?? [];
}
