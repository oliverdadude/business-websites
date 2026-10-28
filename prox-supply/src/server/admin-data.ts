import "server-only";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { buildCatalog, loadItems, marginalUnitCost, reservedTotals, stockSnapshot, valuation, type FullItem } from "./catalog";
import { orderDemands } from "./orders";
import { lowStock, planOrder, unitCraftSeconds, type Plan } from "@/lib/engine";
import { PRODUCTION_STATUSES } from "@/lib/orders";
import type { Settings } from "@/lib/settings-core";
import type { Catalog } from "@/lib/engine";

export function unitValue(catalog: Catalog, s: Settings, i: FullItem): number | null {
  return i.marketValue ?? i.buyPrice ?? marginalUnitCost(catalog, s, i.id);
}

export async function inventoryRows() {
  const [items, s, reserved] = await Promise.all([loadItems(), getSettings(), reservedTotals()]);
  const catalog = buildCatalog(items);
  const rows = items.map((i) => {
    const r = reserved[i.id] ?? 0;
    const value = unitValue(catalog, s, i);
    return {
      item: i,
      onHand: i.onHand,
      reserved: r,
      available: Math.max(0, i.onHand - r),
      unitValue: value,
      stockValue: value === null ? null : value * i.onHand,
      low: i.lowStockThreshold !== null && Math.max(0, i.onHand - r) <= i.lowStockThreshold,
    };
  });
  return { rows, items, s };
}

export async function productionPlan(filter: { orderId?: string; customer?: string } = {}) {
  const orders = await prisma.order.findMany({
    where: {
      status: { in: PRODUCTION_STATUSES },
      ...(filter.orderId ? { id: filter.orderId } : {}),
      ...(filter.customer ? { OR: [{ ign: { contains: filter.customer, mode: "insensitive" } }, { discord: { contains: filter.customer, mode: "insensitive" } }] } : {}),
    },
    include: { lines: true },
    orderBy: { createdAt: "asc" },
  });
  const [items, s] = await Promise.all([loadItems(), getSettings()]);
  const demands = orderDemands(orders.flatMap((o) => o.lines));
  // These orders can use their own reserved stock; other orders' reservations stay off-limits.
  const stock = await stockSnapshot(items, orders.map((o) => o.id));
  let plan: Plan | null = null;
  let error: string | null = null;
  if (Object.keys(demands).length) {
    try {
      plan = planOrder(buildCatalog(items), demands, { ...valuation(s), stock, useStock: true });
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not plan production";
    }
  }
  return { orders, plan, error, stock, items };
}

export async function dashboardData() {
  const [statusCounts, completed, active, ready, inv, prod] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.findMany({ where: { status: "COMPLETED" }, select: { total: true, estCost: true } }),
    prisma.order.findMany({ where: { status: { in: ["ACCEPTED", "GATHERING_MATERIALS", "CRAFTING", "READY_FOR_DELIVERY"] } }, select: { total: true, estCost: true } }),
    prisma.order.findMany({ where: { status: "READY_FOR_DELIVERY" }, select: { id: true, number: true, ign: true, total: true, paymentReceived: true }, orderBy: { updatedAt: "asc" } }),
    inventoryRows(),
    productionPlan(),
  ]);
  const count = Object.fromEntries(statusCounts.map((c) => [c.status, c._count._all])) as Record<string, number>;
  const sumProfit = (os: { total: number; estCost: number | null }[]) => {
    let profit = 0, unknown = 0;
    for (const o of os) o.estCost === null ? unknown++ : (profit += o.total - o.estCost);
    return { profit, unknown };
  };
  const shopping = prod.plan ? prod.plan.nodes.filter((n) => n.mode === "acquire" && n.toAcquire + n.shortfall > 0) : [];
  const invValue = inv.rows.reduce((a, r) => a + (r.stockValue ?? 0), 0);
  const unvalued = inv.rows.filter((r) => r.onHand > 0 && r.stockValue === null).length;
  const low = lowStock(inv.rows.map((r) => ({ itemId: r.item.id, name: r.item.name, available: r.available, threshold: r.item.lowStockThreshold })));
  return {
    pending: count.PENDING_APPROVAL ?? 0,
    inProduction: (count.ACCEPTED ?? 0) + (count.GATHERING_MATERIALS ?? 0) + (count.CRAFTING ?? 0),
    crafting: count.CRAFTING ?? 0,
    readyCount: count.READY_FOR_DELIVERY ?? 0,
    completedCount: count.COMPLETED ?? 0,
    revenue: completed.reduce((a, o) => a + o.total, 0),
    profit: sumProfit(completed),
    pipelineValue: active.reduce((a, o) => a + o.total, 0),
    pipelineProfit: sumProfit(active),
    ready,
    shopping,
    prodError: prod.error,
    craftSeconds: prod.plan?.craftSeconds ?? 0,
    invValue,
    unvalued,
    low,
  };
}

export async function profitabilityData() {
  const [items, s, lines] = await Promise.all([
    loadItems(),
    getSettings(),
    prisma.orderLine.findMany({ where: { order: { status: { not: "CANCELLED" } } }, select: { itemId: true, quantity: true, lineTotal: true, orderId: true } }),
  ]);
  const catalog = buildCatalog(items);
  const products = items
    .filter((i) => i.kind !== "RAW" || i.basePrice !== null)
    .map((i) => {
      const unitCost = marginalUnitCost(catalog, s, i.id);
      const profitUnit = i.basePrice !== null && unitCost !== null ? i.basePrice - unitCost : null;
      let secs: number | null = null;
      try {
        secs = unitCraftSeconds(catalog, i.id, valuation(s));
      } catch {
        secs = null;
      }
      const mine = lines.filter((l) => l.itemId === i.id);
      const orderCount = new Set(mine.map((l) => l.orderId)).size;
      const avgQty = orderCount ? mine.reduce((a, l) => a + l.quantity, 0) / orderCount : null;
      const actualProfit = unitCost === null ? null : mine.reduce((a, l) => a + l.lineTotal - l.quantity * unitCost, 0);
      return {
        item: i,
        unitCost,
        profitUnit,
        marginPct: profitUnit !== null && i.basePrice ? (profitUnit / i.basePrice) * 100 : null,
        secsPerUnit: secs,
        profitPerHour: profitUnit !== null && secs ? (profitUnit / secs) * 3600 : null,
        orderCount,
        avgQty,
        profitPerOrder: actualProfit !== null && orderCount ? actualProfit / orderCount : null,
      };
    });
  const orders = await prisma.order.findMany({
    where: { status: { not: "CANCELLED" }, estCost: { not: null } },
    select: { id: true, number: true, ign: true, status: true, total: true, estCost: true },
  });
  const rankedOrders = orders.map((o) => ({ ...o, profit: o.total - (o.estCost ?? 0) })).sort((a, b) => b.profit - a.profit).slice(0, 25);
  return { products, rankedOrders };
}
