import { describe, expect, it } from "vitest";
import {
  availableStock,
  buildTree,
  craftingSteps,
  CycleError,
  findCycles,
  fulfilmentDeltas,
  planOrder,
  priceForMargin,
  priceLine,
  profitMetrics,
  reservationsFromPlan,
  shoppingList,
  tierFor,
  unitCraftSeconds,
  validateTiers,
} from "@/lib/engine";
import type { Catalog, EngineItem, EngineRecipe } from "@/lib/engine";

// ---------- helpers ----------
let rid = 0;
function recipe(ings: Record<string, number>, opts: Partial<EngineRecipe> = {}): EngineRecipe {
  return {
    id: `r${++rid}`,
    name: "Primary",
    isPrimary: true,
    outputQty: 1,
    craftSeconds: 10,
    extraCostPerBatch: 0,
    verified: true,
    ingredients: Object.entries(ings).map(([itemId, quantity]) => ({ itemId, quantity })),
    ...opts,
  };
}
function item(id: string, opts: Partial<EngineItem> = {}): EngineItem {
  return {
    id,
    name: id,
    kind: opts.recipes?.length ? "INTERMEDIATE" : "RAW",
    acquisition: "PURCHASE",
    sourcePreference: "AUTO",
    buyPrice: null,
    gatherCost: null,
    marketValue: null,
    extraCostPerUnit: 0,
    priceVerified: true,
    recipes: [],
    ...opts,
  };
}
function cat(...items: EngineItem[]): Catalog {
  return new Map(items.map((i) => [i.id, i]));
}

/** The illustrative example from the brief: A = 3B + 2C, B = 4D. */
function exampleCatalog() {
  return cat(
    item("A", { kind: "PRODUCT", recipes: [recipe({ B: 3, C: 2 })] }),
    item("B", { recipes: [recipe({ D: 4 })] }),
    item("C", { buyPrice: 5 }),
    item("D", { buyPrice: 2 }),
  );
}

// ---------- multi-level explosion ----------
describe("multi-level crafting", () => {
  it("breaks the brief's example down to base resources", () => {
    const plan = planOrder(exampleCatalog(), { A: 100 });
    expect(plan.byId.B.required).toBe(300);
    expect(plan.byId.C.required).toBe(200);
    expect(plan.byId.D.required).toBe(1200);
    expect(plan.byId.A.batches).toBe(100);
    expect(plan.byId.B.batches).toBe(300);
    // cost: 200 C * 5 + 1200 D * 2
    expect(plan.cost.materials).toBe(200 * 5 + 1200 * 2);
    expect(plan.cost.complete).toBe(true);
  });

  it("handles unlimited depth (60 stages)", () => {
    const items: EngineItem[] = [item("L0", { buyPrice: 1 })];
    for (let i = 1; i <= 60; i++) items.push(item(`L${i}`, { recipes: [recipe({ [`L${i - 1}`]: 1 })] }));
    const plan = planOrder(cat(...items), { L60: 7 });
    expect(plan.byId.L0.toAcquire).toBe(7);
    expect(plan.byId.L60.stage).toBe(60);
    expect(plan.nodes).toHaveLength(61);
  });

  it("works for extremely large orders without overflow", () => {
    const plan = planOrder(exampleCatalog(), { A: 10_000_000 });
    expect(plan.byId.D.required).toBe(120_000_000);
    expect(plan.cost.materials).toBe(20_000_000 * 5 + 120_000_000 * 2);
  });

  it("rejects bad quantities and unknown items", () => {
    expect(() => planOrder(exampleCatalog(), { A: -1 })).toThrow();
    expect(() => planOrder(exampleCatalog(), { A: 1.5 })).toThrow();
    expect(() => planOrder(exampleCatalog(), { Z: 1 })).toThrow(/Unknown item/);
  });

  it("orders crafting steps lowest stage first", () => {
    const steps = craftingSteps(planOrder(exampleCatalog(), { A: 1 }));
    expect(steps.map((s) => s.itemId)).toEqual(["B", "A"]);
  });
});

// ---------- batch rounding ----------
describe("batch rounding", () => {
  const c = () =>
    cat(
      item("P", { kind: "PRODUCT", recipes: [recipe({ Bolt: 10 })] }),
      item("Bolt", { recipes: [recipe({ Iron: 3 }, { outputQty: 4 })] }),
      item("Iron", { buyPrice: 10 }),
    );

  it("rounds crafts up to whole batches and reports surplus", () => {
    const plan = planOrder(c(), { P: 1 }); // needs 10 bolts, 4 per batch
    expect(plan.byId.Bolt.batches).toBe(3);
    expect(plan.byId.Bolt.produced).toBe(12);
    expect(plan.byId.Bolt.surplus).toBe(2);
    expect(plan.byId.Iron.required).toBe(9); // 3 batches * 3 iron
    expect(plan.cost.materials).toBe(90); // full batches are paid for
  });

  it("exact multiples produce no surplus", () => {
    const plan = planOrder(c(), { P: 2 }); // 20 bolts
    expect(plan.byId.Bolt.batches).toBe(5);
    expect(plan.byId.Bolt.surplus).toBe(0);
  });

  it("rounds product batches too", () => {
    const k = cat(item("Box", { kind: "PRODUCT", recipes: [recipe({ Wood: 2 }, { outputQty: 5 })] }), item("Wood", { buyPrice: 1 }));
    const plan = planOrder(k, { Box: 11 });
    expect(plan.byId.Box.batches).toBe(3);
    expect(plan.byId.Wood.required).toBe(6);
  });
});

// ---------- shared ingredients ----------
describe("shared ingredients across products", () => {
  const c = () =>
    cat(
      item("X", { kind: "PRODUCT", recipes: [recipe({ Gear: 1, Coal: 1 })] }),
      item("Y", { kind: "PRODUCT", recipes: [recipe({ Gear: 1 })] }),
      item("Gear", { recipes: [recipe({ Iron: 1, Coal: 2 }, { outputQty: 10 })] }),
      item("Iron", { buyPrice: 4 }),
      item("Coal", { buyPrice: 1 }),
    );

  it("aggregates demand before rounding (one batch, not two)", () => {
    const plan = planOrder(c(), { X: 3, Y: 3 });
    expect(plan.byId.Gear.required).toBe(6);
    expect(plan.byId.Gear.batches).toBe(1);
    expect(plan.byId.Iron.required).toBe(1);
  });

  it("counts a raw material once across direct and indirect use", () => {
    const plan = planOrder(c(), { X: 3, Y: 3 });
    // Coal: 3 directly for X + 2 for the single Gear batch
    expect(plan.byId.Coal.required).toBe(5);
    expect(plan.nodes.filter((n) => n.itemId === "Coal")).toHaveLength(1);
    expect(plan.cost.materials).toBe(5 * 1 + 1 * 4);
  });

  it("combining orders never needs more than planning them separately", () => {
    const together = planOrder(c(), { X: 4, Y: 3 });
    const apart = planOrder(c(), { X: 4 }).cost.materials + planOrder(c(), { Y: 3 }).cost.materials;
    expect(together.byId.Gear.batches).toBe(1);
    expect(together.cost.materials).toBeLessThan(apart);
  });
});

// ---------- stock ----------
describe("stock deduction", () => {
  it("deducts stock of intermediates before exploding further", () => {
    const plan = planOrder(exampleCatalog(), { A: 100 }, { stock: { B: 100 } });
    expect(plan.byId.B.fromStock).toBe(100);
    expect(plan.byId.B.net).toBe(200);
    expect(plan.byId.D.required).toBe(800);
  });

  it("deducts finished-product stock first", () => {
    const plan = planOrder(exampleCatalog(), { A: 10 }, { stock: { A: 4 } });
    expect(plan.byId.A.batches).toBe(6);
    expect(plan.byId.B.required).toBe(18);
  });

  it("never uses more stock than needed and reports missing materials", () => {
    const plan = planOrder(exampleCatalog(), { A: 1 }, { stock: { C: 50, D: 5 } });
    expect(plan.byId.C.fromStock).toBe(2);
    expect(plan.byId.D.fromStock).toBe(5);
    const list = shoppingList(plan);
    expect(list.find((l) => l.itemId === "D")?.quantity).toBe(7);
    expect(list.find((l) => l.itemId === "C")).toBeUndefined();
  });

  it("ignores stock when useStock is false", () => {
    const plan = planOrder(exampleCatalog(), { A: 1 }, { stock: { D: 999 }, useStock: false });
    expect(plan.byId.D.fromStock).toBe(0);
  });

  it("stock-only items report a shortfall instead of a purchase", () => {
    const k = cat(item("P", { kind: "PRODUCT", recipes: [recipe({ Gem: 2 })] }), item("Gem", { acquisition: "STOCK", marketValue: 100 }));
    const plan = planOrder(k, { P: 5 }, { stock: { Gem: 6 } });
    expect(plan.byId.Gem.shortfall).toBe(4);
    expect(plan.byId.Gem.toAcquire).toBe(0);
  });

  it("availability subtracts other orders' reservations but not your own", () => {
    const rows = [{ itemId: "D", onHand: 100, reserved: 60 }];
    expect(availableStock(rows).D).toBe(40);
    expect(availableStock(rows, { D: 20 }).D).toBe(60);
    expect(availableStock([{ itemId: "D", onHand: 10, reserved: 30 }]).D).toBe(0);
  });

  it("reserves exactly the stock a plan consumes and deducts it on delivery", () => {
    const plan = planOrder(exampleCatalog(), { A: 100 }, { stock: { B: 100, C: 500 } });
    const res = reservationsFromPlan(plan);
    expect(res).toEqual({ B: 100, C: 200 });
    expect(fulfilmentDeltas(res)).toEqual({ B: -100, C: -200 });
  });
});

// ---------- cycles ----------
describe("circular dependencies", () => {
  it("detects a direct loop", () => {
    const k = cat(item("A", { recipes: [recipe({ B: 1 })] }), item("B", { recipes: [recipe({ A: 1 })] }));
    expect(() => planOrder(k, { A: 1 })).toThrow(CycleError);
    expect(findCycles(k).length).toBeGreaterThan(0);
  });

  it("detects a self loop", () => {
    const k = cat(item("A", { recipes: [recipe({ A: 1 })] }));
    expect(() => planOrder(k, { A: 1 })).toThrow(/Circular/);
  });

  it("reports a loop when every recipe is circular", () => {
    const k = cat(
      item("A", { recipes: [recipe({ B: 1 }), recipe({ B: 2 }, { isPrimary: false })] }),
      item("B", { recipes: [recipe({ A: 1 })] }),
    );
    expect(() => planOrder(k, { A: 1 })).toThrow(CycleError);
  });

  it("skips a cyclic alternative recipe when another route exists", () => {
    const k = cat(
      item("A", { recipes: [recipe({ B: 1 }, { isPrimary: true }), recipe({ Ore: 2 }, { isPrimary: false, name: "Alt" })] }),
      item("B", { recipes: [recipe({ A: 1 })] }),
      item("Ore", { buyPrice: 1 }),
    );
    const plan = planOrder(k, { A: 3 });
    expect(plan.byId.A.recipeName).toBe("Alt");
    expect(plan.byId.Ore.required).toBe(6);
  });
});

// ---------- craft vs buy ----------
describe("craft versus buy", () => {
  const k = (bPrice: number | null, pref: EngineItem["sourcePreference"] = "AUTO") =>
    cat(
      item("A", { kind: "PRODUCT", recipes: [recipe({ B: 1 })] }),
      item("B", { buyPrice: bPrice, sourcePreference: pref, recipes: [recipe({ D: 4 })] }),
      item("D", { buyPrice: 1 }),
    );

  it("buys the intermediate when it's cheaper than crafting", () => {
    const plan = planOrder(k(3), { A: 10 });
    expect(plan.byId.B.mode).toBe("acquire");
    expect(plan.byId.D).toBeUndefined();
    expect(plan.cost.materials).toBe(30);
  });

  it("crafts when crafting is cheaper", () => {
    const plan = planOrder(k(5), { A: 10 });
    expect(plan.byId.B.mode).toBe("craft");
    expect(plan.cost.materials).toBe(40);
  });

  it("respects CRAFT and BUY preferences", () => {
    expect(planOrder(k(1, "CRAFT"), { A: 1 }).byId.B.mode).toBe("craft");
    expect(planOrder(k(9, "BUY"), { A: 1 }).byId.B.mode).toBe("acquire");
  });

  it("crafts when the item can't be bought, so materials are still listed", () => {
    const plan = planOrder(k(null), { A: 2 });
    expect(plan.byId.D.required).toBe(8);
  });

  it("chooses the cheapest of several recipes", () => {
    const c = cat(
      item("A", { recipes: [recipe({ Gold: 1 }, { name: "Gold" }), recipe({ Iron: 3 }, { name: "Iron", isPrimary: false })] }),
      item("Gold", { buyPrice: 50 }),
      item("Iron", { buyPrice: 10 }),
    );
    expect(planOrder(c, { A: 1 }).byId.A.recipeName).toBe("Iron");
  });

  it("honours a forced recipe override", () => {
    const r1 = recipe({ Gold: 1 }, { name: "Gold" });
    const c = cat(item("A", { recipes: [r1, recipe({ Iron: 3 }, { name: "Iron", isPrimary: false })] }), item("Gold", { buyPrice: 50 }), item("Iron", { buyPrice: 10 }));
    expect(planOrder(c, { A: 1 }, { recipeOverrides: { A: r1.id } }).byId.A.recipeName).toBe("Gold");
  });
});

// ---------- costs ----------
describe("costing", () => {
  it("values gathered materials at gather cost or market value", () => {
    const k = cat(item("P", { kind: "PRODUCT", recipes: [recipe({ Coal: 10 })] }), item("Coal", { acquisition: "GATHER", gatherCost: 0, marketValue: 7 }));
    expect(planOrder(k, { P: 1 }).cost.materials).toBe(0);
    expect(planOrder(k, { P: 1 }, { valueGatheredAtMarket: true }).cost.materials).toBe(70);
  });

  it("values consumed stock at market or as free", () => {
    const k = cat(item("P", { kind: "PRODUCT", recipes: [recipe({ Iron: 10 })] }), item("Iron", { buyPrice: 5, marketValue: 6 }));
    const opts = { stock: { Iron: 4 } };
    const atMarket = planOrder(k, { P: 1 }, { ...opts, valueStockAtMarket: true });
    expect(atMarket.cost.materials).toBe(30);
    expect(atMarket.cost.stock).toBe(24);
    expect(atMarket.cost.resources).toBe(54);
    expect(planOrder(k, { P: 1 }, { ...opts, valueStockAtMarket: false }).cost.resources).toBe(30);
  });

  it("adds per-batch and per-unit extra expenses to production cost", () => {
    const k = cat(
      item("P", { kind: "PRODUCT", extraCostPerUnit: 2, recipes: [recipe({ Iron: 1 }, { outputQty: 5, extraCostPerBatch: 100 })] }),
      item("Iron", { buyPrice: 10 }),
    );
    const plan = planOrder(k, { P: 6 }); // 2 batches
    expect(plan.cost.materials).toBe(20);
    expect(plan.cost.extras).toBe(200 + 12);
    expect(plan.cost.production).toBe(232);
  });

  it("flags unpriced materials instead of treating them as free", () => {
    const k = cat(item("P", { kind: "PRODUCT", recipes: [recipe({ Mystery: 1, Iron: 1 })] }), item("Mystery"), item("Iron", { buyPrice: 3 }));
    const plan = planOrder(k, { P: 2 });
    expect(plan.cost.complete).toBe(false);
    expect(plan.cost.unpriced).toEqual(["Mystery"]);
    expect(plan.cost.materials).toBe(6);
  });

  it("lists unverified recipes and prices", () => {
    const k = cat(item("P", { kind: "PRODUCT", recipes: [recipe({ Iron: 1 }, { verified: false })] }), item("Iron", { buyPrice: 3, priceVerified: false }));
    expect(planOrder(k, { P: 1 }).unverified.sort()).toEqual(["Iron", "P"]);
  });
});

// ---------- time ----------
describe("production time", () => {
  it("multiplies craft time by batches across all levels", () => {
    const plan = planOrder(exampleCatalog(), { A: 10 }); // 10 A batches + 30 B batches, 10s each
    expect(plan.craftSeconds).toBe(400);
    expect(unitCraftSeconds(exampleCatalog(), "A")).toBe(40);
  });

  it("reports unknown times", () => {
    const k = cat(item("P", { kind: "PRODUCT", recipes: [recipe({ Iron: 1 }, { craftSeconds: null })] }), item("Iron", { buyPrice: 1 }));
    const plan = planOrder(k, { P: 1 });
    expect(plan.unknownTimes).toEqual(["P"]);
    expect(unitCraftSeconds(k, "P")).toBeNull();
  });
});

// ---------- tree ----------
describe("crafting tree", () => {
  it("builds a nested tree with quantities per branch", () => {
    const t = buildTree(exampleCatalog(), "A", 2);
    expect(t.children.map((c) => [c.itemId, c.quantity])).toEqual([["B", 6], ["C", 4]]);
    expect(t.children[0].children[0]).toMatchObject({ itemId: "D", quantity: 24 });
  });
});

// ---------- pricing ----------
describe("bulk pricing", () => {
  const tiers = [
    { minQty: 10, pct: 3 },
    { minQty: 50, pct: 5 },
    { minQty: 100, pct: 8 },
    { minQty: 500, pct: 12 },
  ];
  const cfg = { basePrice: 100, tiers, minMarginPct: 15, quoteThreshold: 1000 };

  it("picks the right tier at each boundary", () => {
    expect([1, 9, 10, 49, 50, 99, 100, 499, 500, 5000].map((q) => tierFor(tiers, q))).toEqual([0, 0, 3, 3, 5, 5, 8, 8, 12, 12]);
  });

  it("applies the tier discount when margin allows", () => {
    const l = priceLine(cfg, 100, 5000); // floor = ceil(5000/0.85) = 5883
    expect(l.lineTotal).toBe(9200);
    expect(l.discount).toBe(800);
    expect(l.cappedByMargin).toBe(false);
  });

  it("caps the discount so the minimum margin holds", () => {
    const l = priceLine(cfg, 500, 42_000); // tier would give 44,000; floor = 49,412
    expect(l.lineTotal).toBe(priceForMargin(42_000, 15));
    expect(l.cappedByMargin).toBe(true);
    expect(profitMetrics(l.lineTotal, 42_000).marginPct!).toBeGreaterThanOrEqual(15);
  });

  it("gives no discount and flags it when even the base price misses the margin", () => {
    const l = priceLine(cfg, 100, 9_500);
    expect(l.lineTotal).toBe(10_000);
    expect(l.belowMinMargin).toBe(true);
  });

  it("withholds discounts when production cost is unknown", () => {
    const l = priceLine(cfg, 100, null);
    expect(l.lineTotal).toBe(10_000);
    expect(l.costUnknown).toBe(true);
    expect(priceLine(cfg, 100, null, { discountWithoutCost: true }).lineTotal).toBe(9200);
  });

  it("requires a quote at the threshold", () => {
    expect(priceLine(cfg, 999, null).quoteRequired).toBe(false);
    expect(priceLine(cfg, 1000, null).quoteRequired).toBe(true);
  });

  it("refuses unpriced items and bad quantities", () => {
    expect(() => priceLine({ ...cfg, basePrice: null }, 1, null)).toThrow();
    expect(() => priceLine(cfg, 0, null)).toThrow();
    expect(() => priceLine(cfg, 2.5, null)).toThrow();
  });

  it("validates tier tables", () => {
    expect(validateTiers(tiers)).toBeNull();
    expect(validateTiers([{ minQty: 10, pct: 3 }, { minQty: 10, pct: 5 }])).toMatch(/Two tiers/);
    expect(validateTiers([{ minQty: 0, pct: 3 }])).not.toBeNull();
    expect(validateTiers([{ minQty: 5, pct: 100 }])).not.toBeNull();
  });
});

describe("profit metrics", () => {
  it("keeps margin and markup separate", () => {
    const m = profitMetrics(1000, 750, 10);
    expect(m.profit).toBe(250);
    expect(m.marginPct).toBe(25);
    expect(m.markupPct).toBeCloseTo(33.333, 2);
    expect(m.breakEvenUnit).toBe(75);
  });

  it("break-even price for a margin", () => {
    expect(priceForMargin(850, 15)).toBe(1000);
    expect(priceForMargin(100, 0)).toBe(100);
  });

  it("handles zero revenue and zero cost", () => {
    expect(profitMetrics(0, 10).marginPct).toBeNull();
    expect(profitMetrics(10, 0).markupPct).toBeNull();
  });
});
