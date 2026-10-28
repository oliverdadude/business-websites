// Inventory helpers: availability, reservations and fulfilment deltas.
import type { Plan } from "./types";

export interface StockRow {
  itemId: string;
  onHand: number;
  /** Units reserved by orders (all of them). */
  reserved: number;
}

/** Units free to use. Optionally ignore one order's own reservations (when re-planning it). */
export function availableStock(
  rows: StockRow[],
  ownReservations: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.itemId] = Math.max(0, r.onHand - r.reserved + (ownReservations[r.itemId] ?? 0));
  }
  return out;
}

/** Stock a plan consumes, at every crafting level: this is what gets reserved. */
export function reservationsFromPlan(plan: Plan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of plan.nodes) if (n.fromStock > 0) out[n.itemId] = n.fromStock;
  return out;
}

/** Inventory change when an order with these reservations is delivered. */
export function fulfilmentDeltas(reservations: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, q] of Object.entries(reservations)) if (q > 0) out[id] = -q;
  return out;
}

export interface LowStockRow {
  itemId: string;
  name: string;
  available: number;
  threshold: number | null;
}

export function lowStock(rows: LowStockRow[]): LowStockRow[] {
  return rows.filter((r) => r.threshold !== null && r.available <= r.threshold);
}
