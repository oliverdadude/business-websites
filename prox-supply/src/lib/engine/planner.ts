// Multi-level crafting planner.
//
// Given a set of demanded items (from one order or many), it:
//  1. decides for every item whether to craft it (and with which recipe) or acquire it,
//  2. walks the chosen crafting graph in topological order so shared ingredients are
//     aggregated BEFORE batches are rounded (no double counting, minimal waste),
//  3. deducts available stock at every level,
//  4. rounds crafts up to whole batches and tracks the surplus they create,
//  5. prices everything and totals crafting time.

import { CycleError, DEFAULT_VALUATION, UnknownItemError } from "./types";
import type {
  Catalog,
  CostBreakdown,
  EngineItem,
  EngineRecipe,
  Plan,
  PlanNode,
  PlanOptions,
  ValuationSettings,
} from "./types";

export interface Choice {
  mode: "craft" | "acquire";
  recipe: EngineRecipe | null;
  /** Marginal cost of one unit, ignoring batch rounding and stock. null = unknown. */
  unitCost: number | null;
  /** Cost of one unit if acquired directly (null if impossible / unknown). */
  acquireUnitCost: number | null;
  /** Marginal craft cost per recipe id (null = unknown, undefined = not considered). */
  recipeUnitCosts: Record<string, number | null>;
}

class CycleSignal {
  stack: string[];
  constructor(stack: string[]) {
    this.stack = stack;
  }
}

function getItem(catalog: Catalog, id: string): EngineItem {
  const item = catalog.get(id);
  if (!item) throw new UnknownItemError(id);
  return item;
}

export function acquireUnitCost(item: EngineItem, settings: ValuationSettings): number | null {
  switch (item.acquisition) {
    case "PURCHASE":
      return item.buyPrice;
    case "GATHER":
      return settings.valueGatheredAtMarket ? item.marketValue ?? null : item.gatherCost ?? 0;
    case "STOCK":
      // Can only come from stock; a shortfall is valued at replacement cost.
      return item.marketValue ?? item.buyPrice ?? null;
  }
}

/**
 * Builds a memoised chooser that decides craft vs acquire for each item and returns
 * marginal unit costs. Used by the planner, craft-vs-buy comparisons and rankings.
 */
export function createChooser(
  catalog: Catalog,
  settings: ValuationSettings = DEFAULT_VALUATION,
  overrides: Record<string, string> = {},
) {
  const memo = new Map<string, Choice>();
  const stack: string[] = [];

  function recipeCost(recipe: EngineRecipe): number | null {
    if (recipe.outputQty <= 0) return null;
    let total = recipe.extraCostPerBatch;
    for (const ing of recipe.ingredients) {
      const c = choose(ing.itemId).unitCost;
      if (c === null) return null;
      total += c * ing.quantity;
    }
    return total / recipe.outputQty;
  }

  function choose(id: string): Choice {
    const cached = memo.get(id);
    if (cached) return cached;
    if (stack.includes(id)) throw new CycleSignal([...stack.slice(stack.indexOf(id)), id]);

    const item = getItem(catalog, id);
    const acq = acquireUnitCost(item, settings);
    const forced = overrides[id];
    let candidates: EngineRecipe[] = [];
    if (forced) {
      const r = item.recipes.find((x) => x.id === forced);
      if (!r) throw new Error(`Recipe ${forced} does not belong to ${item.name}`);
      candidates = [r];
    } else if (item.sourcePreference !== "BUY") {
      candidates = [...item.recipes].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    }

    const recipeUnitCosts: Record<string, number | null> = {};
    const usable: EngineRecipe[] = [];
    let skippedCycle: CycleSignal | null = null;
    stack.push(id);
    try {
      for (const r of candidates) {
        try {
          recipeUnitCosts[r.id] = recipeCost(r);
          usable.push(r);
        } catch (e) {
          // A cyclic recipe is skipped only when the item has another recipe to use;
          // a sole recipe that loops is a data error and is reported.
          const canFallBack = !forced && candidates.length > 1;
          if (e instanceof CycleSignal && canFallBack) {
            skippedCycle = e;
            continue;
          }
          throw e;
        }
      }
    } finally {
      stack.pop();
    }
    if (usable.length === 0 && skippedCycle) throw skippedCycle;

    let choice: Choice;
    const mustCraft = !!forced || item.sourcePreference === "CRAFT";
    if (usable.length === 0) {
      choice = { mode: "acquire", recipe: null, unitCost: acq, acquireUnitCost: acq, recipeUnitCosts };
    } else {
      // Cheapest known recipe; ties keep primary first.
      let best: EngineRecipe | null = null;
      let bestCost: number | null = null;
      for (const r of usable) {
        const c = recipeUnitCosts[r.id];
        if (c !== null && (bestCost === null || c < bestCost)) {
          best = r;
          bestCost = c;
        }
      }
      const fallbackRecipe = usable[0];
      if (mustCraft) {
        choice = { mode: "craft", recipe: best ?? fallbackRecipe, unitCost: bestCost, acquireUnitCost: acq, recipeUnitCosts };
      } else if (bestCost !== null && (acq === null || bestCost <= acq)) {
        choice = { mode: "craft", recipe: best, unitCost: bestCost, acquireUnitCost: acq, recipeUnitCosts };
      } else if (acq !== null) {
        choice = { mode: "acquire", recipe: null, unitCost: acq, acquireUnitCost: acq, recipeUnitCosts };
      } else {
        // Nothing is priced: break it down so the material list is still complete.
        choice = { mode: "craft", recipe: fallbackRecipe, unitCost: null, acquireUnitCost: acq, recipeUnitCosts };
      }
    }
    memo.set(id, choice);
    return choice;
  }

  return (id: string): Choice => {
    try {
      return choose(id);
    } catch (e) {
      if (e instanceof CycleSignal) {
        throw new CycleError(e.stack.map((x) => catalog.get(x)?.name ?? x));
      }
      throw e;
    }
  };
}

/** Throws CycleError if any recipe (primary or alternative) forms a loop. */
export function findCycles(catalog: Catalog): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, 1 | 2>();
  const path: string[] = [];
  const visit = (id: string) => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) {
      const cyc = [...path.slice(path.indexOf(id)), id].map((x) => catalog.get(x)?.name ?? x);
      cycles.push(cyc);
      return;
    }
    state.set(id, 1);
    path.push(id);
    const item = catalog.get(id);
    for (const r of item?.recipes ?? []) for (const ing of r.ingredients) if (catalog.has(ing.itemId)) visit(ing.itemId);
    path.pop();
    state.set(id, 2);
  };
  for (const id of catalog.keys()) visit(id);
  return cycles;
}

export function planOrder(
  catalog: Catalog,
  demandsIn: Record<string, number>,
  options: PlanOptions = {},
): Plan {
  const settings: ValuationSettings = {
    valueGatheredAtMarket: options.valueGatheredAtMarket ?? DEFAULT_VALUATION.valueGatheredAtMarket,
    valueStockAtMarket: options.valueStockAtMarket ?? DEFAULT_VALUATION.valueStockAtMarket,
  };
  const useStock = options.useStock ?? options.stock !== undefined;
  const stock = options.stock ?? {};
  const choose = createChooser(catalog, settings, options.recipeOverrides);

  const demands: Record<string, number> = {};
  for (const [id, q] of Object.entries(demandsIn)) {
    if (!Number.isFinite(q) || q < 0 || !Number.isInteger(q)) throw new Error(`Invalid quantity for ${id}: ${q}`);
    getItem(catalog, id);
    if (q > 0) demands[id] = (demands[id] ?? 0) + q;
  }

  // 1. Topological order over the CHOSEN graph (parents before children), with cycle check.
  const state = new Map<string, 1 | 2>();
  const post: string[] = [];
  const path: string[] = [];
  const visit = (id: string) => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) {
      throw new CycleError([...path.slice(path.indexOf(id)), id].map((x) => catalog.get(x)?.name ?? x));
    }
    state.set(id, 1);
    path.push(id);
    const c = choose(id);
    if (c.mode === "craft" && c.recipe) for (const ing of c.recipe.ingredients) visit(ing.itemId);
    path.pop();
    state.set(id, 2);
    post.push(id);
  };
  for (const id of Object.keys(demands)) visit(id);
  const order = [...post].reverse();

  // 2. Stage numbers (children first).
  const stage: Record<string, number> = {};
  for (const id of post) {
    const c = choose(id);
    if (c.mode === "craft" && c.recipe) {
      stage[id] = 1 + Math.max(0, ...c.recipe.ingredients.map((i) => stage[i.itemId] ?? 0));
    } else stage[id] = 0;
  }

  // 3. Explode quantities in topological order.
  const required: Record<string, number> = { ...demands };
  const nodes: PlanNode[] = [];
  const byId: Record<string, PlanNode> = {};
  let craftSeconds = 0;
  const unknownTimes: string[] = [];
  const unverified = new Set<string>();

  for (const id of order) {
    const item = getItem(catalog, id);
    const c = choose(id);
    const need = required[id] ?? 0;
    const avail = useStock ? Math.max(0, Math.floor(stock[id] ?? 0)) : 0;
    const fromStock = Math.min(need, avail);
    const net = need - fromStock;

    let batches = 0, produced = 0, surplus = 0, toAcquire = 0, shortfall = 0, batchExtra = 0;
    let secs: number | null = 0;
    const recipe = c.mode === "craft" ? c.recipe : null;
    if (recipe) {
      batches = net > 0 ? Math.ceil(net / recipe.outputQty) : 0;
      produced = batches * recipe.outputQty;
      surplus = produced - net;
      batchExtra = batches * recipe.extraCostPerBatch;
      for (const ing of recipe.ingredients) required[ing.itemId] = (required[ing.itemId] ?? 0) + ing.quantity * batches;
      if (batches > 0) {
        if (recipe.craftSeconds === null) {
          secs = null;
          unknownTimes.push(item.name);
        } else {
          secs = recipe.craftSeconds * batches;
          craftSeconds += secs;
        }
      }
      if (!recipe.verified) unverified.add(item.name);
    } else {
      if (item.acquisition === "STOCK") shortfall = net;
      else toAcquire = net;
      if (!item.priceVerified && net > 0) unverified.add(item.name);
    }

    const acqUnit = recipe ? null : c.acquireUnitCost;
    const stockUnit = settings.valueStockAtMarket ? item.marketValue ?? c.unitCost : 0;
    const acquireQty = toAcquire + shortfall;
    const node: PlanNode = {
      itemId: id,
      name: item.name,
      kind: item.kind,
      mode: recipe ? "craft" : "acquire",
      acquisition: item.acquisition,
      recipeId: recipe?.id ?? null,
      recipeName: recipe?.name ?? null,
      station: recipe?.station ?? null,
      stage: stage[id] ?? 0,
      required: need,
      fromStock,
      net,
      batches,
      produced,
      surplus,
      toAcquire,
      shortfall,
      acquireUnitCost: acqUnit,
      stockUnitValue: stockUnit ?? null,
      acquireCost: recipe ? 0 : acquireQty === 0 ? 0 : acqUnit === null ? null : acqUnit * acquireQty,
      stockCost: fromStock === 0 ? 0 : stockUnit === null || stockUnit === undefined ? null : stockUnit * fromStock,
      batchExtraCost: batchExtra,
      craftSeconds: recipe ? secs : 0,
      verified: recipe ? recipe.verified : item.priceVerified,
    };
    nodes.push(node);
    byId[id] = node;
  }

  // 4. Costs.
  const cost: CostBreakdown = { materials: 0, stock: 0, resources: 0, extras: 0, production: 0, unpriced: [], complete: true };
  for (const n of nodes) {
    if (n.acquireCost === null) cost.unpriced.push(n.name);
    else cost.materials += n.acquireCost;
    if (n.stockCost === null) {
      if (!cost.unpriced.includes(n.name)) cost.unpriced.push(n.name);
    } else cost.stock += n.stockCost;
    cost.extras += n.batchExtraCost;
  }
  for (const [id, q] of Object.entries(demands)) cost.extras += getItem(catalog, id).extraCostPerUnit * q;
  cost.resources = cost.materials + cost.stock;
  cost.production = cost.resources + cost.extras;
  cost.complete = cost.unpriced.length === 0;

  return { demands, nodes, byId, cost, craftSeconds, unknownTimes, unverified: [...unverified] };
}

/** Units of each acquired item still needed, split by how you get them. */
export function shoppingList(plan: Plan) {
  return plan.nodes
    .filter((n) => n.mode === "acquire" && n.toAcquire + n.shortfall > 0)
    .map((n) => ({
      itemId: n.itemId,
      name: n.name,
      acquisition: n.acquisition,
      quantity: n.toAcquire + n.shortfall,
      shortfall: n.shortfall,
      unitCost: n.acquireUnitCost,
      cost: n.acquireCost,
    }));
}

/** Crafting steps grouped by stage, lowest stage first (what to craft first). */
export function craftingSteps(plan: Plan) {
  return plan.nodes
    .filter((n) => n.mode === "craft" && n.batches > 0)
    .sort((a, b) => a.stage - b.stage || a.name.localeCompare(b.name));
}

export interface TreeNode {
  itemId: string;
  name: string;
  quantity: number;
  mode: "craft" | "acquire";
  recipeName: string | null;
  outputQty: number | null;
  batches: number;
  unitCost: number | null;
  verified: boolean;
  children: TreeNode[];
}

/** Ingredient tree for visualisation (per-branch rounding, no stock). */
export function buildTree(
  catalog: Catalog,
  itemId: string,
  quantity: number,
  settings: ValuationSettings = DEFAULT_VALUATION,
  overrides: Record<string, string> = {},
): TreeNode {
  const choose = createChooser(catalog, settings, overrides);
  const walk = (id: string, qty: number, seen: string[]): TreeNode => {
    const item = getItem(catalog, id);
    if (seen.includes(id)) throw new CycleError([...seen, id].map((x) => catalog.get(x)?.name ?? x));
    const c = choose(id);
    const r = c.mode === "craft" ? c.recipe : null;
    const batches = r ? Math.ceil(qty / r.outputQty) : 0;
    return {
      itemId: id,
      name: item.name,
      quantity: qty,
      mode: r ? "craft" : "acquire",
      recipeName: r?.name ?? null,
      outputQty: r?.outputQty ?? null,
      batches,
      unitCost: c.unitCost,
      verified: r ? r.verified : item.priceVerified,
      children: r ? r.ingredients.map((i) => walk(i.itemId, i.quantity * batches, [...seen, id])) : [],
    };
  };
  return walk(itemId, quantity, []);
}

/** Marginal crafting seconds per unit (recursive), null when any time is unknown. */
export function unitCraftSeconds(
  catalog: Catalog,
  itemId: string,
  settings: ValuationSettings = DEFAULT_VALUATION,
): number | null {
  const choose = createChooser(catalog, settings);
  const memo = new Map<string, number | null>();
  const go = (id: string): number | null => {
    if (memo.has(id)) return memo.get(id)!;
    const c = choose(id);
    let v: number | null = 0;
    if (c.mode === "craft" && c.recipe) {
      if (c.recipe.craftSeconds === null) v = null;
      else {
        v = c.recipe.craftSeconds / c.recipe.outputQty;
        for (const ing of c.recipe.ingredients) {
          const s = go(ing.itemId);
          if (s === null) { v = null; break; }
          v += (s * ing.quantity) / c.recipe.outputQty;
        }
      }
    }
    memo.set(id, v);
    return v;
  };
  return go(itemId);
}
