import "server-only";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { availableStock, planOrder, type Plan } from "@/lib/engine";
import { buildCatalog, itemInclude, quoteFromItems, valuation, type CartQuote, type FullItem } from "@/lib/catalog-core";

export * from "@/lib/catalog-core";

export async function loadItems(): Promise<FullItem[]> {
  return prisma.item.findMany({ include: itemInclude, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

/** Units reserved per item across all orders (optionally excluding some orders). */
export async function reservedTotals(excludeOrderIds: string[] = []): Promise<Record<string, number>> {
  const rows = await prisma.reservation.groupBy({
    by: ["itemId"],
    _sum: { quantity: true },
    where: excludeOrderIds.length ? { orderId: { notIn: excludeOrderIds } } : undefined,
  });
  return Object.fromEntries(rows.map((r) => [r.itemId, r._sum.quantity ?? 0]));
}

/** Free stock per item, treating the given orders' own reservations as available to them. */
export async function stockSnapshot(items: FullItem[], excludeOrderIds: string[] = []) {
  const reserved = await reservedTotals(excludeOrderIds);
  return availableStock(items.map((i) => ({ itemId: i.id, onHand: i.onHand, reserved: reserved[i.id] ?? 0 })));
}

/** Server-authoritative pricing for a cart. Never trusts client prices. */
export async function quoteCart(input: { itemId: string; quantity: number }[]): Promise<CartQuote> {
  const [items, s] = await Promise.all([loadItems(), getSettings()]);
  return quoteFromItems(items, s, input);
}

/** Plan for a set of demands against current available stock. */
export async function planDemands(
  demands: Record<string, number>,
  opts: { excludeOrderIds?: string[]; useStock?: boolean } = {},
): Promise<{ plan: Plan | null; error: string | null; items: FullItem[] }> {
  const [items, s] = await Promise.all([loadItems(), getSettings()]);
  const catalog = buildCatalog(items);
  const stock = opts.useStock === false ? undefined : await stockSnapshot(items, opts.excludeOrderIds);
  try {
    const plan = planOrder(catalog, demands, { ...valuation(s), stock, useStock: opts.useStock !== false });
    return { plan, error: null, items };
  } catch (e) {
    return { plan: null, error: e instanceof Error ? e.message : "Could not plan this order", items };
  }
}
