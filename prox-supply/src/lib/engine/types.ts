// Pure data types used by the crafting / costing / pricing engine.
// They are deliberately independent of Prisma so the engine is easy to test.

export type Acquisition = "PURCHASE" | "GATHER" | "STOCK";
export type SourcePreference = "AUTO" | "CRAFT" | "BUY";
export type ItemKind = "RAW" | "INTERMEDIATE" | "PRODUCT";

export interface EngineIngredient {
  itemId: string;
  quantity: number;
}

export interface EngineRecipe {
  id: string;
  name: string;
  isPrimary: boolean;
  outputQty: number;
  craftSeconds: number | null;
  extraCostPerBatch: number;
  verified: boolean;
  station?: string | null;
  ingredients: EngineIngredient[];
}

export interface EngineItem {
  id: string;
  name: string;
  kind: ItemKind;
  acquisition: Acquisition;
  sourcePreference: SourcePreference;
  buyPrice: number | null;
  gatherCost: number | null;
  marketValue: number | null;
  extraCostPerUnit: number;
  priceVerified: boolean;
  recipes: EngineRecipe[];
}

export type Catalog = Map<string, EngineItem>;

export interface ValuationSettings {
  /** Value gathered materials at their market replacement cost instead of gatherCost. */
  valueGatheredAtMarket: boolean;
  /** Count stock you already hold at its market value (opportunity cost) instead of free. */
  valueStockAtMarket: boolean;
}

export const DEFAULT_VALUATION: ValuationSettings = {
  valueGatheredAtMarket: false,
  valueStockAtMarket: true,
};

export interface PlanOptions extends Partial<ValuationSettings> {
  /** Units available per item (already net of other orders' reservations). */
  stock?: Record<string, number>;
  /** Deduct available stock before crafting / buying. Default true when stock is given. */
  useStock?: boolean;
  /** Force a specific recipe for an item (itemId -> recipeId). */
  recipeOverrides?: Record<string, string>;
}

export type NodeMode = "craft" | "acquire";

export interface PlanNode {
  itemId: string;
  name: string;
  kind: ItemKind;
  mode: NodeMode;
  acquisition: Acquisition;
  recipeId: string | null;
  recipeName: string | null;
  station: string | null;
  /** Crafting stage: 0 = acquired, 1 = crafted only from acquired items, etc. */
  stage: number;
  /** Total units required by the order(s) and by parent crafts. */
  required: number;
  /** Units covered by stock you hold. */
  fromStock: number;
  /** Units still needed after stock. */
  net: number;
  /** Crafting batches (0 when acquired). */
  batches: number;
  /** Units produced by those batches. */
  produced: number;
  /** Extra units produced because batches round up. */
  surplus: number;
  /** Units to buy / gather (0 when crafted). */
  toAcquire: number;
  /** Units that must come from stock but stock is short (acquisition = STOCK). */
  shortfall: number;
  /** Cost per unit used for anything acquired, or null if unknown. */
  acquireUnitCost: number | null;
  /** Value per unit applied to stock consumed. */
  stockUnitValue: number | null;
  acquireCost: number | null;
  stockCost: number | null;
  batchExtraCost: number;
  craftSeconds: number | null;
  verified: boolean;
}

export interface CostBreakdown {
  /** Raw materials bought / gathered for this order. */
  materials: number;
  /** Value of stock consumed. */
  stock: number;
  /** materials + stock: every resource actually consumed. */
  resources: number;
  /** Extra per-batch and per-unit production expenses. */
  extras: number;
  /** resources + extras. */
  production: number;
  /** Items whose cost could not be priced (missing price data). */
  unpriced: string[];
  complete: boolean;
}

export interface Plan {
  demands: Record<string, number>;
  nodes: PlanNode[];
  byId: Record<string, PlanNode>;
  cost: CostBreakdown;
  craftSeconds: number;
  /** Items crafted whose time is unknown. */
  unknownTimes: string[];
  /** Items using unverified recipes or prices. */
  unverified: string[];
}

export class CycleError extends Error {
  path: string[];
  constructor(path: string[]) {
    super(`Circular crafting dependency: ${path.join(" → ")}`);
    this.path = path;
    this.name = "CycleError";
  }
}

export class UnknownItemError extends Error {
  itemId: string;
  constructor(itemId: string) {
    super(`Unknown item: ${itemId}`);
    this.itemId = itemId;
    this.name = "UnknownItemError";
  }
}
