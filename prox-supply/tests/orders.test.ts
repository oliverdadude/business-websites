import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  allowedTransitions,
  applyFulfilment,
  canTransition,
  generateOrderNumber,
  generateTrackingToken,
  hashToken,
  inventoryEffect,
  ORDER_NUMBER_RE,
  ORDER_STATUSES,
  verifyToken,
} from "@/lib/orders";
import { planOrder, reservationsFromPlan, availableStock } from "@/lib/engine";
import { buildCatalog } from "@/lib/catalog-core";
import { fullItem, recipeOf } from "./helpers";

describe("status transitions", () => {
  it("pending orders can only be approved or rejected", () => {
    expect(allowedTransitions("PENDING_APPROVAL").sort()).toEqual(["ACCEPTED", "CANCELLED"]);
    expect(canTransition("PENDING_APPROVAL", "CRAFTING")).toBe(false);
    expect(canTransition("PENDING_APPROVAL", "COMPLETED")).toBe(false);
  });

  it("active orders move freely between active stages, and to completed or cancelled", () => {
    for (const s of ACTIVE_STATUSES) {
      expect(canTransition(s, "COMPLETED")).toBe(true);
      expect(canTransition(s, "CANCELLED")).toBe(true);
      expect(canTransition(s, s)).toBe(false);
      expect(canTransition(s, "PENDING_APPROVAL")).toBe(false);
    }
    expect(canTransition("CRAFTING", "GATHERING_MATERIALS")).toBe(true);
  });

  it("completed and cancelled are final", () => {
    for (const to of ORDER_STATUSES) {
      expect(canTransition("COMPLETED", to)).toBe(false);
      expect(canTransition("CANCELLED", to)).toBe(false);
    }
  });

  it("maps transitions to the right inventory effect", () => {
    expect(inventoryEffect("PENDING_APPROVAL", "ACCEPTED")).toBe("reserve");
    expect(inventoryEffect("PENDING_APPROVAL", "CANCELLED")).toBe("none");
    expect(inventoryEffect("CRAFTING", "CANCELLED")).toBe("release");
    expect(inventoryEffect("READY_FOR_DELIVERY", "COMPLETED")).toBe("deduct");
    expect(inventoryEffect("ACCEPTED", "CRAFTING")).toBe("none");
    expect(() => inventoryEffect("COMPLETED", "CANCELLED")).toThrow(/Cannot move/);
  });
});

describe("order numbers and tracking tokens", () => {
  it("generates PRX-XXXXX numbers without ambiguous characters", () => {
    for (let i = 0; i < 500; i++) expect(generateOrderNumber()).toMatch(ORDER_NUMBER_RE);
    expect(generateOrderNumber(() => 0)).toBe("PRX-22222");
    expect(ORDER_NUMBER_RE.test("PRX-0O1I2")).toBe(false);
  });

  it("stores only a hash and verifies tokens in constant time", () => {
    const t = generateTrackingToken();
    expect(t.length).toBeGreaterThanOrEqual(32);
    const h = hashToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(verifyToken(t, h)).toBe(true);
    expect(verifyToken(t + "x", h)).toBe(false);
    expect(verifyToken("", h)).toBe(false);
    expect(verifyToken(t, "not-a-hash")).toBe(false);
    expect(generateTrackingToken()).not.toBe(t);
  });
});

describe("reservations and fulfilment", () => {
  // P = 2 B; B = 3 D. Stock: 1 P, 4 B, 10 D.
  const catalog = buildCatalog([
    fullItem("P", { kind: "PRODUCT", onHand: 1, recipes: [recipeOf("P", { B: 2 })] }),
    fullItem("B", { kind: "INTERMEDIATE", onHand: 4, recipes: [recipeOf("B", { D: 3 })] }),
    fullItem("D", { buyPrice: 1, onHand: 10 }),
  ]);

  it("reserves stock at every level of the plan", () => {
    const stock = availableStock([
      { itemId: "P", onHand: 1, reserved: 0 },
      { itemId: "B", onHand: 4, reserved: 0 },
      { itemId: "D", onHand: 10, reserved: 0 },
    ]);
    const plan = planOrder(catalog, { P: 5 }, { stock });
    // 5 P: 1 from stock, craft 4 → 8 B: 4 from stock, craft 4 → 12 D: 10 from stock, buy 2.
    expect(reservationsFromPlan(plan)).toEqual({ P: 1, B: 4, D: 10 });
    expect(plan.byId.D.toAcquire).toBe(2);
  });

  it("a second order can't use stock reserved by the first", () => {
    const stock = availableStock([
      { itemId: "P", onHand: 1, reserved: 1 },
      { itemId: "B", onHand: 4, reserved: 4 },
      { itemId: "D", onHand: 10, reserved: 10 },
    ]);
    const plan = planOrder(catalog, { P: 1 }, { stock });
    expect(reservationsFromPlan(plan)).toEqual({});
    expect(plan.byId.D.toAcquire).toBe(6);
  });

  it("delivery deducts reserved units and never goes negative", () => {
    const rows = applyFulfilment({ P: 1, B: 4, D: 3 }, { P: 1, B: 4, D: 10, X: 0 });
    expect(rows).toEqual([
      { itemId: "P", before: 1, delta: -1, after: 0, clamped: false },
      { itemId: "B", before: 4, delta: -4, after: 0, clamped: false },
      { itemId: "D", before: 3, delta: -3, after: 0, clamped: true },
    ]);
  });
});
