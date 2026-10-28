// Pure catalog helpers shared by the server and tests (no database access here).
import type { Prisma } from "@prisma/client";
import {
  createChooser,
  planOrder,
  priceLine,
  type Catalog,
  type EngineItem,
  type LinePrice,
  type ValuationSettings,
} from "./engine";
import type { Settings } from "./settings-core";

export const itemInclude = {
  recipes: { include: { ingredients: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
  tiers: { orderBy: { minQty: "asc" } },
} satisfies Prisma.ItemInclude;

export type FullItem = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

export function toEngineItem(i: FullItem): EngineItem {
  return {
    id: i.id,
    name: i.name,
    kind: i.kind,
    acquisition: i.acquisition,
    sourcePreference: i.sourcePreference,
    buyPrice: i.buyPrice,
    gatherCost: i.gatherCost,
    marketValue: i.marketValue,
    extraCostPerUnit: i.extraCostPerUnit,
    priceVerified: i.priceStatus === "VERIFIED",
    recipes: i.recipes.map((r) => ({
      id: r.id,
      name: r.name,
      isPrimary: r.isPrimary,
      outputQty: r.outputQty,
      craftSeconds: r.craftSeconds,
      extraCostPerBatch: r.extraCostPerBatch,
      verified: r.status === "VERIFIED",
      station: r.station,
      ingredients: r.ingredients.map((g) => ({ itemId: g.itemId, quantity: g.quantity })),
    })),
  };
}

export function buildCatalog(items: FullItem[]): Catalog {
  return new Map(items.map((i) => [i.id, toEngineItem(i)]));
}

export function valuation(s: Pick<Settings, "valueGatheredAtMarket" | "valueStockAtMarket">): ValuationSettings {
  return { valueGatheredAtMarket: s.valueGatheredAtMarket, valueStockAtMarket: s.valueStockAtMarket };
}

export function isSellable(i: Pick<FullItem, "approvedForSale" | "basePrice">): boolean {
  return i.approvedForSale && i.basePrice !== null && i.basePrice > 0;
}

/** Non-raw items with no recipe at all: shown as "Unverified — Recipe Required". */
export function needsRecipe(i: Pick<FullItem, "kind" | "recipes">): boolean {
  return i.kind !== "RAW" && i.recipes.length === 0;
}

/** Replacement cost to produce `qty` of one item (no stock), or null if anything is unpriced. */
export function lineCost(catalog: Catalog, s: Settings, itemId: string, qty: number): number | null {
  try {
    const plan = planOrder(catalog, { [itemId]: qty }, { ...valuation(s), useStock: false });
    return plan.cost.complete ? plan.cost.production : null;
  } catch {
    return null;
  }
}

/** Marginal cost of one unit (no batch rounding), including per-unit extras. */
export function marginalUnitCost(catalog: Catalog, s: Settings, itemId: string): number | null {
  try {
    const c = createChooser(catalog, valuation(s))(itemId).unitCost;
    return c === null ? null : c + (catalog.get(itemId)?.extraCostPerUnit ?? 0);
  } catch {
    return null;
  }
}

/** Reasons an item's data can't be trusted yet (shown when approving it for sale). */
export function unverifiedReasons(catalog: Catalog, s: Settings, item: FullItem): string[] {
  const out: string[] = [];
  if (needsRecipe(item) && item.buyPrice === null) out.push("Unverified — Recipe Required");
  if (item.basePrice === null) out.push("No selling price set");
  else if (item.priceStatus !== "VERIFIED") out.push("Selling/cost prices are unverified");
  try {
    const plan = planOrder(catalog, { [item.id]: 1 }, { ...valuation(s), useStock: false });
    for (const n of plan.unverified) if (n !== item.name || item.recipes.length) out.push(`Unverified recipe or price: ${n}`);
    if (!plan.cost.complete) out.push(`Unpriced materials: ${plan.cost.unpriced.join(", ")}`);
  } catch (e) {
    out.push(e instanceof Error ? e.message : "Could not plan this item");
  }
  return [...new Set(out)];
}

export interface QuotedLine extends LinePrice {
  itemId: string;
  name: string;
  slug: string;
  category: string;
}

export interface CartQuote {
  lines: QuotedLine[];
  errors: { itemId: string; message: string }[];
  subtotal: number;
  discount: number;
  total: number;
  quoteRequired: boolean;
  /** Sum of replacement production costs, null if any line's cost is unknown. Server-only. */
  estCost: number | null;
}

export const MAX_QTY = 1_000_000;

/** Server-authoritative pricing for a cart. Never trusts client prices. */
export function quoteFromItems(
  items: FullItem[],
  s: Settings,
  input: { itemId: string; quantity: number }[],
): CartQuote {
  const byId = new Map(items.map((i) => [i.id, i]));
  const catalog = buildCatalog(items);

  // Merge duplicate lines.
  const merged = new Map<string, number>();
  for (const l of input) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.quantity);

  const out: CartQuote = { lines: [], errors: [], subtotal: 0, discount: 0, total: 0, quoteRequired: false, estCost: 0 };
  for (const [itemId, quantity] of merged) {
    const it = byId.get(itemId);
    if (!it || !isSellable(it)) {
      out.errors.push({ itemId, message: "This item isn't available to order right now." });
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      out.errors.push({ itemId, message: "Enter a whole number between 1 and 1,000,000." });
      continue;
    }
    const cost = lineCost(catalog, s, itemId, quantity);
    const lp = priceLine(
      {
        basePrice: it.basePrice,
        tiers: it.tiers.map((t) => ({ minQty: t.minQty, pct: t.pct })),
        minMarginPct: it.minMarginPct,
        quoteThreshold: it.quoteThreshold ?? s.defaultQuoteThreshold,
      },
      quantity,
      cost,
    );
    out.lines.push({ ...lp, itemId, name: it.name, slug: it.slug, category: it.category });
    out.subtotal += lp.subtotal;
    out.discount += lp.discount;
    out.total += lp.lineTotal;
    out.quoteRequired ||= lp.quoteRequired;
    out.estCost = cost === null || out.estCost === null ? null : out.estCost + cost;
  }
  if (out.lines.length === 0) out.estCost = null;
  return out;
}

/** Strip server-only fields (cost, margin floors) before sending a quote to a customer. */
export function publicQuote(q: CartQuote) {
  return {
    lines: q.lines.map((l) => ({
      itemId: l.itemId,
      name: l.name,
      slug: l.slug,
      category: l.category,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      tierPct: l.tierPct,
      appliedPct: l.appliedPct,
      subtotal: l.subtotal,
      discount: l.discount,
      lineTotal: l.lineTotal,
      quoteRequired: l.quoteRequired,
      discountLimited: l.cappedByMargin || (l.costUnknown && l.tierPct > 0),
    })),
    errors: q.errors,
    subtotal: q.subtotal,
    discount: q.discount,
    total: q.total,
    quoteRequired: q.quoteRequired,
  };
}
export type PublicQuote = ReturnType<typeof publicQuote>;
