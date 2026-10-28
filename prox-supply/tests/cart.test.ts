import { describe, expect, it } from "vitest";
import { publicQuote, quoteFromItems, unverifiedReasons, buildCatalog, needsRecipe } from "@/lib/catalog-core";
import { fullItem, recipeOf, settings, tiers } from "./helpers";

// Widget = 2 Bolt + 1 Plate. Bolt bought at 3, Plate at 4 → cost 10 per Widget.
function items() {
  return [
    fullItem("Bolt", { buyPrice: 3 }),
    fullItem("Plate", { buyPrice: 4 }),
    fullItem("Widget", {
      kind: "PRODUCT", basePrice: 20, approvedForSale: true, minMarginPct: 40,
      recipes: [recipeOf("Widget", { Bolt: 2, Plate: 1 })],
      tiers: tiers("Widget", [[10, 5], [100, 30]]),
    }),
    fullItem("Gizmo", { kind: "PRODUCT", basePrice: 50, approvedForSale: true, tiers: tiers("Gizmo", [[10, 10]]) }),
    fullItem("Hidden", { kind: "PRODUCT", basePrice: 9, approvedForSale: false }),
    fullItem("Unpriced", { kind: "PRODUCT", basePrice: null, approvedForSale: true }),
  ];
}

describe("cart quoting (server side)", () => {
  it("totals lines with tier discounts", () => {
    const q = quoteFromItems(items(), settings(), [{ itemId: "Widget", quantity: 10 }]);
    expect(q.errors).toEqual([]);
    expect(q.subtotal).toBe(200);
    expect(q.total).toBe(190); // 5% off
    expect(q.discount).toBe(10);
    expect(q.estCost).toBe(100);
  });

  it("caps discounts at the minimum margin", () => {
    // 100 × 20 = 2000, 30% off = 1400. Cost 1000, 40% margin floor = 1667.
    const q = quoteFromItems(items(), settings(), [{ itemId: "Widget", quantity: 100 }]);
    expect(q.lines[0].lineTotal).toBe(1667);
    expect(q.lines[0].cappedByMargin).toBe(true);
    expect(publicQuote(q).lines[0].discountLimited).toBe(true);
  });

  it("merges duplicate lines before pricing (so tiers apply to the total)", () => {
    const q = quoteFromItems(items(), settings(), [
      { itemId: "Widget", quantity: 6 },
      { itemId: "Widget", quantity: 4 },
    ]);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0].quantity).toBe(10);
    expect(q.total).toBe(190);
  });

  it("withholds discounts when the cost is unknown", () => {
    const q = quoteFromItems(items(), settings(), [{ itemId: "Gizmo", quantity: 10 }]);
    expect(q.total).toBe(500);
    expect(q.estCost).toBeNull();
    expect(publicQuote(q).lines[0].discountLimited).toBe(true);
  });

  it("blocks unavailable, unpriced and invalid lines", () => {
    const q = quoteFromItems(items(), settings(), [
      { itemId: "Hidden", quantity: 1 },
      { itemId: "Unpriced", quantity: 1 },
      { itemId: "Nope", quantity: 1 },
      { itemId: "Widget", quantity: 0 },
      { itemId: "Gizmo", quantity: 2.5 },
    ]);
    expect(q.lines).toHaveLength(0);
    expect(q.errors.map((e) => e.itemId).sort()).toEqual(["Gizmo", "Hidden", "Nope", "Unpriced", "Widget"]);
    expect(q.total).toBe(0);
  });

  it("flags lines that need a custom quote using the default threshold", () => {
    const q = quoteFromItems(items(), settings({ defaultQuoteThreshold: 50 }), [{ itemId: "Gizmo", quantity: 50 }]);
    expect(q.quoteRequired).toBe(true);
    expect(quoteFromItems(items(), settings({ defaultQuoteThreshold: 50 }), [{ itemId: "Gizmo", quantity: 49 }]).quoteRequired).toBe(false);
  });

  it("never exposes cost data to customers", () => {
    const pub = publicQuote(quoteFromItems(items(), settings(), [{ itemId: "Widget", quantity: 100 }]));
    const json = JSON.stringify(pub);
    expect(json).not.toContain("estCost");
    expect(json).not.toContain("floorTotal");
    expect(json).not.toContain("1000");
  });
});

describe("verification warnings", () => {
  it("flags products without recipes and unverified data", () => {
    const list = [
      fullItem("Ore", { priceStatus: "UNVERIFIED", acquisition: "GATHER" }),
      fullItem("Thing", { kind: "PRODUCT", basePrice: 10 }),
      fullItem("Bar", { kind: "PRODUCT", basePrice: 10, recipes: [recipeOf("Bar", { Ore: 2 }, { status: "UNVERIFIED" })] }),
    ];
    const cat = buildCatalog(list);
    expect(needsRecipe(list[1])).toBe(true);
    expect(unverifiedReasons(cat, settings(), list[1])).toContain("Unverified — Recipe Required");
    const bar = unverifiedReasons(cat, settings(), list[2]);
    expect(bar.some((w) => w.includes("Bar"))).toBe(true);
    expect(bar.some((w) => w.includes("Ore"))).toBe(true);
  });
});
