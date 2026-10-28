// Order lifecycle rules, order numbers and tracking tokens. Pure, no database access.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const ORDER_STATUSES = [
  "PENDING_APPROVAL",
  "ACCEPTED",
  "GATHERING_MATERIALS",
  "CRAFTING",
  "READY_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_APPROVAL: "Pending Approval",
  ACCEPTED: "Accepted",
  GATHERING_MATERIALS: "Gathering Materials",
  CRAFTING: "Crafting",
  READY_FOR_DELIVERY: "Ready for Delivery",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Accepted and not yet finished: these orders hold stock reservations. */
export const ACTIVE_STATUSES: OrderStatus[] = ["ACCEPTED", "GATHERING_MATERIALS", "CRAFTING", "READY_FOR_DELIVERY"];
/** Accepted orders that still need production work (feed the production queue). */
export const PRODUCTION_STATUSES: OrderStatus[] = ["ACCEPTED", "GATHERING_MATERIALS", "CRAFTING"];
export const TERMINAL_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED"];

/**
 * Allowed moves:
 *  - Pending → Accepted (approve) or Cancelled (reject).
 *  - Any active status → any other active status (forwards or back, to fix mistakes),
 *    → Completed (delivered) or → Cancelled.
 *  - Completed and Cancelled are final.
 */
export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  if (from === "PENDING_APPROVAL") return ["ACCEPTED", "CANCELLED"];
  if (ACTIVE_STATUSES.includes(from)) {
    return [...ACTIVE_STATUSES.filter((s) => s !== from), "COMPLETED", "CANCELLED"];
  }
  return [];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions(from).includes(to);
}

/** What a transition does to stock. */
export function inventoryEffect(from: OrderStatus, to: OrderStatus): "reserve" | "release" | "deduct" | "none" {
  if (!canTransition(from, to)) throw new Error(`Cannot move an order from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}`);
  if (from === "PENDING_APPROVAL" && to === "ACCEPTED") return "reserve";
  if (to === "CANCELLED") return from === "PENDING_APPROVAL" ? "none" : "release";
  if (to === "COMPLETED") return "deduct";
  return "none";
}

// Unambiguous characters only (no 0/O, 1/I).
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateOrderNumber(rand: (max: number) => number = randomInt): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[rand(ALPHABET.length)];
  return `PRX-${s}`;
}

export const ORDER_NUMBER_RE = /^PRX-[2-9A-HJ-NP-Z]{5}$/;

export function generateTrackingToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyToken(token: string, storedHash: string): boolean {
  if (!token || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface FulfilmentRow {
  itemId: string;
  before: number;
  delta: number;
  after: number;
  /** On-hand was lower than the reservation (stock was corrected meanwhile). */
  clamped: boolean;
}

/** Stock changes when an order is delivered: reserved units leave inventory, never below zero. */
export function applyFulfilment(onHand: Record<string, number>, reservations: Record<string, number>): FulfilmentRow[] {
  const rows: FulfilmentRow[] = [];
  for (const [itemId, q] of Object.entries(reservations)) {
    if (q <= 0) continue;
    const before = onHand[itemId] ?? 0;
    const after = Math.max(0, before - q);
    rows.push({ itemId, before, delta: after - before, after, clamped: before < q });
  }
  return rows;
}
