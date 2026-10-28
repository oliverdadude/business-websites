import type { FullItem } from "@/lib/catalog-core";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings-core";

let n = 0;
export function fullItem(id: string, o: Partial<FullItem> = {}): FullItem {
  const now = new Date(0);
  return {
    id, slug: id.toLowerCase(), name: id, category: "Test", kind: "RAW", description: "",
    acquisition: "PURCHASE", sourcePreference: "AUTO", buyPrice: null, gatherCost: null, marketValue: null, sellPrice: null,
    priceStatus: "VERIFIED", basePrice: null, approvedForSale: false, featured: false, popular: false, minMarginPct: 15,
    quoteThreshold: null, extraCostPerUnit: 0, onHand: 0, lowStockThreshold: null, isDemo: false, createdAt: now, updatedAt: now,
    recipes: [], tiers: [], ...o,
  };
}

export function recipeOf(itemId: string, ings: Record<string, number>, o: Partial<FullItem["recipes"][number]> = {}): FullItem["recipes"][number] {
  const id = `rec${++n}`;
  const now = new Date(0);
  return {
    id, itemId, name: "Primary", isPrimary: true, outputQty: 1, craftSeconds: 10, station: null, skill: null, skillLevel: null,
    extraCostPerBatch: 0, status: "VERIFIED", notes: "", createdAt: now, updatedAt: now,
    ingredients: Object.entries(ings).map(([itemId2, quantity], i) => ({ id: `${id}-${i}`, recipeId: id, itemId: itemId2, quantity })),
    ...o,
  };
}

export function tiers(itemId: string, list: [number, number][]): FullItem["tiers"] {
  return list.map(([minQty, pct], i) => ({ id: `${itemId}-t${i}`, itemId, minQty, pct }));
}

export const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, defaultQuoteThreshold: 5000, ...o });
