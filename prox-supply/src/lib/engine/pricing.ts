// Bulk pricing, margin protection and profit metrics.

export interface Tier {
  minQty: number;
  pct: number;
}

export interface PricingConfig {
  basePrice: number | null;
  tiers: Tier[];
  minMarginPct: number;
  quoteThreshold: number | null;
}

export interface LinePrice {
  quantity: number;
  unitPrice: number;        // base price per unit
  tierPct: number;          // discount the tier table offers
  appliedPct: number;       // discount actually given after margin protection
  subtotal: number;         // quantity * base price
  discount: number;         // subtotal - lineTotal
  lineTotal: number;
  cappedByMargin: boolean;  // tier discount reduced to protect the minimum margin
  belowMinMargin: boolean;  // even the base price is below the minimum margin
  quoteRequired: boolean;
  floorTotal: number | null; // lowest total that keeps the minimum margin
  costUnknown: boolean;     // no production cost, so discounts were withheld
}

export function tierFor(tiers: Tier[], qty: number): number {
  let pct = 0;
  let best = -1;
  for (const t of tiers) if (qty >= t.minQty && t.minQty > best) { best = t.minQty; pct = t.pct; }
  return Math.min(100, Math.max(0, pct));
}

/** Smallest whole-dollar total that achieves `marginPct` on `cost`. */
export function priceForMargin(cost: number, marginPct: number): number {
  if (marginPct >= 100) return Infinity;
  return Math.ceil(cost / (1 - marginPct / 100) - 1e-9);
}

/**
 * Prices one order line.
 * @param productionCost cost to produce this line's quantity (null if unknown, which disables margin protection).
 */
export function priceLine(
  cfg: PricingConfig,
  quantity: number,
  productionCost: number | null,
  opts: { discountWithoutCost?: boolean } = {},
): LinePrice {
  if (cfg.basePrice === null) throw new Error("Item has no price");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive whole number");
  const subtotal = cfg.basePrice * quantity;
  const tierPct = tierFor(cfg.tiers, quantity);
  // Without a known cost we can't guarantee the minimum margin, so no discount by default.
  const costUnknown = productionCost === null;
  const withhold = costUnknown && !opts.discountWithoutCost;
  let lineTotal = withhold ? subtotal : Math.round(subtotal * (1 - tierPct / 100));
  let cappedByMargin = false;
  let belowMinMargin = false;
  let floorTotal: number | null = null;

  if (productionCost !== null) {
    floorTotal = priceForMargin(productionCost, cfg.minMarginPct);
    if (lineTotal < floorTotal) {
      if (subtotal <= floorTotal) {
        // Base price itself doesn't meet the minimum margin: give no discount, flag it.
        belowMinMargin = subtotal < floorTotal;
        cappedByMargin = lineTotal < subtotal;
        lineTotal = subtotal;
      } else {
        lineTotal = floorTotal;
        cappedByMargin = true;
      }
    }
  }
  const discount = subtotal - lineTotal;
  return {
    quantity,
    unitPrice: cfg.basePrice,
    tierPct,
    appliedPct: subtotal > 0 ? (discount / subtotal) * 100 : 0,
    subtotal,
    discount,
    lineTotal,
    cappedByMargin,
    belowMinMargin,
    quoteRequired: cfg.quoteThreshold !== null && quantity >= cfg.quoteThreshold,
    floorTotal,
    costUnknown,
  };
}

export interface ProfitMetrics {
  revenue: number;
  cost: number;
  profit: number;
  /** profit / revenue * 100 */
  marginPct: number | null;
  /** profit / cost * 100 (return on cost) */
  markupPct: number | null;
  /** cost per unit: the lowest unit price that doesn't lose money */
  breakEvenUnit: number | null;
}

export function profitMetrics(revenue: number, cost: number, quantity?: number): ProfitMetrics {
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
    markupPct: cost > 0 ? (profit / cost) * 100 : null,
    breakEvenUnit: quantity && quantity > 0 ? cost / quantity : null,
  };
}

export function validateTiers(tiers: Tier[]): string | null {
  const seen = new Set<number>();
  for (const t of tiers) {
    if (!Number.isInteger(t.minQty) || t.minQty < 1) return "Tier quantities must be whole numbers of 1 or more";
    if (!(t.pct >= 0 && t.pct < 100)) return "Tier discounts must be between 0 and 99.99%";
    if (seen.has(t.minQty)) return `Two tiers start at ${t.minQty}`;
    seen.add(t.minQty);
  }
  return null;
}
