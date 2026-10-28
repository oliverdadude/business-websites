import type { Tier } from "./engine";

export interface Settings {
  businessName: string;
  sellerDiscord: string;
  ordersOpen: boolean;
  valueGatheredAtMarket: boolean;
  valueStockAtMarket: boolean;
  defaultMinMarginPct: number;
  defaultTiers: Tier[];
  defaultQuoteThreshold: number | null;
  extraCostPerOrder: number;
}

export const DEFAULT_SETTINGS: Settings = {
  businessName: "Proximity Supply Co.",
  sellerDiscord: process.env.NEXT_PUBLIC_SELLER_DISCORD || "",
  ordersOpen: true,
  valueGatheredAtMarket: false,
  valueStockAtMarket: true,
  defaultMinMarginPct: 15,
  // Placeholder tiers from the brief. Not confirmed pricing — edit in Admin → Settings.
  defaultTiers: [
    { minQty: 10, pct: 3 },
    { minQty: 50, pct: 5 },
    { minQty: 100, pct: 8 },
    { minQty: 500, pct: 12 },
  ],
  defaultQuoteThreshold: 5000,
  extraCostPerOrder: 0,
};
