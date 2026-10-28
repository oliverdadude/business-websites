import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { planDemands, publicQuote, quoteCart } from "./catalog";
import { reservationsFromPlan } from "@/lib/engine";
import {
  ACTIVE_STATUSES,
  applyFulfilment,
  generateOrderNumber,
  generateTrackingToken,
  hashToken,
  inventoryEffect,
  STATUS_LABEL,
  type OrderStatus,
} from "@/lib/orders";
import type { CheckoutInput } from "@/lib/schemas";

export type CreateOrderResult =
  | { ok: true; number: string; token: string }
  | { ok: false; status: number; error: string; details?: unknown };

export async function createOrder(input: CheckoutInput): Promise<CreateOrderResult> {
  const s = await getSettings();
  if (!s.ordersOpen) return { ok: false, status: 403, error: "Orders are closed right now. Please check back later." };

  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { number: true } });
  if (existing) {
    return { ok: false, status: 409, error: `This order was already placed as ${existing.number}. Use the tracking link from your confirmation.`, details: { duplicate: existing.number } };
  }

  const quote = await quoteCart(input.lines);
  if (quote.errors.length) return { ok: false, status: 400, error: "Some items in your cart can't be ordered.", details: publicQuote(quote) };
  if (input.expectedTotal !== undefined && input.expectedTotal !== quote.total) {
    return { ok: false, status: 409, error: "Prices changed since you opened your cart. Please review the new total.", details: { priceChanged: true, quote: publicQuote(quote) } };
  }

  const token = generateTrackingToken();
  const estCost = quote.estCost === null ? null : quote.estCost + s.extraCostPerOrder;
  for (let attempt = 0; attempt < 6; attempt++) {
    const number = generateOrderNumber();
    try {
      await prisma.order.create({
        data: {
          number,
          trackingTokenHash: hashToken(token),
          idempotencyKey: input.idempotencyKey,
          ign: input.ign,
          discord: input.discord.replace(/^@/, ""),
          instructions: input.instructions,
          quoteRequested: quote.quoteRequired,
          subtotal: quote.subtotal,
          discountTotal: quote.discount,
          total: quote.total,
          estCost,
          lines: {
            create: quote.lines.map((l) => ({
              itemId: l.itemId,
              itemName: l.name,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountPct: l.appliedPct,
              lineTotal: l.lineTotal,
            })),
          },
          events: {
            create: {
              status: "PENDING_APPROVAL",
              note: quote.quoteRequired ? "Order placed. Large quantity: the seller will confirm a custom quote." : "Order placed.",
            },
          },
        },
      });
      return { ok: true, number, token };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String((e.meta as { target?: unknown })?.target ?? "");
        if (target.includes("idempotency")) {
          const o = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { number: true } });
          return { ok: false, status: 409, error: `This order was already placed as ${o?.number}.`, details: { duplicate: o?.number } };
        }
        continue; // order number collision: try another
      }
      throw e;
    }
  }
  return { ok: false, status: 500, error: "Could not create an order number. Please try again." };
}

export function orderDemands(lines: { itemId: string; quantity: number }[]): Record<string, number> {
  const d: Record<string, number> = {};
  for (const l of lines) d[l.itemId] = (d[l.itemId] ?? 0) + l.quantity;
  return d;
}

/** Live crafting plan for one order. */
export async function planForOrder(order: { id: string; status: OrderStatus; lines: { itemId: string; quantity: number }[] }) {
  const terminal = order.status === "COMPLETED" || order.status === "CANCELLED";
  return planDemands(orderDemands(order.lines), { excludeOrderIds: [order.id], useStock: !terminal });
}

export class OrderActionError extends Error {}

export async function transitionOrder(orderId: string, to: OrderStatus, note = "", opts: { rejectionReason?: string } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { lines: true, reservations: true } });
  if (!order) throw new OrderActionError("Order not found");
  const from = order.status as OrderStatus;
  let effect: ReturnType<typeof inventoryEffect>;
  try {
    effect = inventoryEffect(from, to);
  } catch (e) {
    throw new OrderActionError(e instanceof Error ? e.message : "Invalid status change");
  }

  let reservations: Record<string, number> = {};
  let estCost: number | null | undefined;
  if (effect === "reserve") {
    const { plan, error } = await planForOrder({ ...order, status: from });
    if (!plan) throw new OrderActionError(`Can't accept: ${error}`);
    reservations = reservationsFromPlan(plan);
    const s = await getSettings();
    estCost = plan.cost.complete ? plan.cost.production + s.extraCostPerOrder : null;
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: from },
      data: {
        status: to,
        ...(estCost !== undefined ? { estCost } : {}),
        ...(opts.rejectionReason !== undefined ? { rejectionReason: opts.rejectionReason } : {}),
      },
    });
    if (updated.count !== 1) throw new OrderActionError("The order changed in the meantime. Reload and try again.");

    if (effect === "reserve") {
      const entries = Object.entries(reservations);
      if (entries.length) {
        await tx.reservation.createMany({ data: entries.map(([itemId, quantity]) => ({ orderId, itemId, quantity })) });
      }
    } else if (effect === "release") {
      await tx.reservation.deleteMany({ where: { orderId } });
    } else if (effect === "deduct") {
      const res = await tx.reservation.findMany({ where: { orderId } });
      const items = await tx.item.findMany({ where: { id: { in: res.map((r) => r.itemId) } }, select: { id: true, onHand: true } });
      const rows = applyFulfilment(
        Object.fromEntries(items.map((i) => [i.id, i.onHand])),
        Object.fromEntries(res.map((r) => [r.itemId, r.quantity])),
      );
      for (const r of rows) {
        await tx.item.update({ where: { id: r.itemId }, data: { onHand: r.after } });
        await tx.inventoryAdjustment.create({
          data: {
            itemId: r.itemId,
            delta: r.delta,
            reason: `Order ${order.number} completed${r.clamped ? " (on-hand was lower than reserved; clamped at 0)" : ""}`,
          },
        });
      }
      await tx.reservation.deleteMany({ where: { orderId } });
      await tx.order.update({ where: { id: orderId }, data: { inventoryApplied: true } });
    }

    await tx.orderEvent.create({ data: { orderId, status: to, note: note.slice(0, 1000) } });
  });
  return { from, to, label: STATUS_LABEL[to] };
}

export function isActive(status: OrderStatus) {
  return ACTIVE_STATUSES.includes(status);
}
