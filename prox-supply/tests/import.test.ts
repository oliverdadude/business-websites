import { describe, expect, it } from "vitest";
import { exportJson, exportRows, parseImport as parseAny, toCsv, type ImportFormat, type ParsedImport } from "@/lib/import";

// Narrowing helper so each test gets the row type for the import kind it parses.
function parseImport<T extends ParsedImport["type"]>(type: T, format: ImportFormat, text: string, names: string[]) {
  type Of<K> = Extract<ParsedImport, { type: K extends "materials" | "products" ? "materials" | "products" : K }>;
  return parseAny(type, format, text, names) as Of<T>;
}
import { fullItem, recipeOf } from "./helpers";

const names = ["Coal", "Iron", "Steel Bar", "Toolkit"];

describe("CSV import parsing", () => {
  it("parses materials with blank cells left unchanged", () => {
    const csv = "name,category,buyPrice,gatherCost,priceStatus,lowStockThreshold\nCoal,Mining,,0,verified,100\nNew Ore,Mining,\"$1,250\",,,";
    const p = parseImport("materials", "csv", csv, names);
    expect(p.errors).toEqual([]);
    expect(p.rows[0]).toEqual({ name: "Coal", category: "Mining", kind: "RAW", gatherCost: 0, priceStatus: "VERIFIED", lowStockThreshold: 100 });
    expect(p.rows[1]).toMatchObject({ name: "New Ore", buyPrice: 1250 });
    expect("gatherCost" in p.rows[1]).toBe(false);
  });

  it("reports row-level validation errors", () => {
    const csv = "name,kind,buyPrice,approvedForSale,minMarginPct\nA,PRODUCT,1,,\n,RAW,1,,\nB,RAW,-4,,\nC,RAW,1.5,,\nD,RAW,1,maybe,\nE,RAW,1,,120\nF,RAW,1,,\nf,RAW,2,,";
    const p = parseImport("materials", "csv", csv, []);
    const byRow = Object.fromEntries(p.errors.map((e) => [e.row, e.message]));
    expect(byRow[1]).toMatch(/kind RAW/);
    expect(byRow[2]).toMatch(/name is required/);
    expect(byRow[3]).toMatch(/at least 0/);
    expect(byRow[4]).toMatch(/whole number/);
    expect(byRow[5]).toMatch(/true or false/);
    expect(byRow[6]).toMatch(/between 0 and 99/);
    expect(byRow[8]).toMatch(/Duplicate of row 7/);
  });

  it("warns about unknown columns", () => {
    const p = parseImport("prices", "csv", "name,buyPrice,colour\nCoal,5,red", names);
    expect(p.errors).toEqual([]);
    expect(p.warnings[0].message).toMatch(/colour/);
  });

  it("only updates prices and inventory for existing items", () => {
    const p = parseImport("prices", "csv", "name,basePrice\nCoal,10\nGhost,5", names);
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0]).toMatchObject({ row: 2, field: "name" });
    const inv = parseImport("inventory", "csv", "name,onHand,reason\nIron,40,Counted\nCoal,,x", names);
    expect(inv.rows).toEqual([{ name: "Iron", onHand: 40, reason: "Counted" }]);
    expect(inv.errors[0].message).toMatch(/onHand is required/);
  });

  it("supports clearing a value with 'none'", () => {
    const p = parseImport("prices", "csv", "name,buyPrice\nCoal,none", names);
    expect(p.rows[0]).toEqual({ name: "Coal", buyPrice: null });
  });

  it("groups recipe rows into recipes and checks ingredients", () => {
    const csv = [
      "item,recipe,outputQty,craftSeconds,status,ingredient,quantity",
      "Steel Bar,Primary,2,30,VERIFIED,Iron,3",
      "Steel Bar,Primary,,,,Coal,1",
      "Toolkit,,1,,,Steel Bar,4",
      "Toolkit,Cheap,1,,,Iron,10",
      "Toolkit,Cheap,1,,,Iron,2",
      "Toolkit,Bad,1,,,Unobtainium,1",
      "Iron,Loop,1,,,Iron,1",
    ].join("\n");
    const p = parseImport("recipes", "csv", csv, names);
    const steel = p.rows.find((r) => r.item === "Steel Bar")!;
    expect(steel).toMatchObject({ recipe: "Primary", outputQty: 2, craftSeconds: 30, status: "VERIFIED", isPrimary: true });
    expect(steel.ingredients).toEqual([{ item: "Iron", quantity: 3 }, { item: "Coal", quantity: 1 }]);
    const toolkit = p.rows.filter((r) => r.item === "Toolkit");
    expect(toolkit.map((r) => r.recipe)).toEqual(["Primary", "Cheap", "Bad"]);
    expect(toolkit.filter((r) => r.isPrimary)).toHaveLength(1);
    const msgs = p.errors.map((e) => `${e.row}:${e.message}`);
    expect(msgs.some((m) => m.startsWith("5:") && /already listed/.test(m))).toBe(true);
    expect(msgs.some((m) => m.startsWith("6:") && /Unobtainium/.test(m))).toBe(true);
    expect(msgs.some((m) => m.startsWith("7:") && /itself/.test(m))).toBe(true);
    expect(msgs.some((m) => /"Bad" for Toolkit has no ingredients/.test(m))).toBe(true);
  });
});

describe("JSON import parsing", () => {
  it("accepts nested recipe JSON", () => {
    const json = JSON.stringify([{ item: "Steel Bar", recipe: "Primary", outputQty: 2, ingredients: [{ item: "Iron", quantity: 3 }, { item: "Coal", quantity: 1 }] }]);
    const p = parseImport("recipes", "json", json, names);
    expect(p.errors).toEqual([]);
    expect(p.rows[0].ingredients).toHaveLength(2);
  });

  it("rejects invalid JSON and non-arrays", () => {
    expect(parseImport("materials", "json", "{oops", []).errors[0].message).toMatch(/Invalid JSON/);
    expect(parseImport("materials", "json", '{"name":"x"}', []).errors[0].message).toMatch(/array/);
    expect(parseImport("materials", "json", '[1]', []).errors[0].message).toMatch(/not an object/);
  });

  it("parses typed JSON values", () => {
    const p = parseImport("products", "json", JSON.stringify([{ name: "Toolkit", kind: "PRODUCT", basePrice: 900, approvedForSale: true }]), names);
    expect(p.rows[0]).toEqual({ name: "Toolkit", kind: "PRODUCT", basePrice: 900, approvedForSale: true });
  });
});

describe("export round trip", () => {
  const items = [
    fullItem("Iron", { buyPrice: 2 }),
    fullItem("Coal", { gatherCost: 0, acquisition: "GATHER" }),
    fullItem("Steel Bar", { kind: "INTERMEDIATE", recipes: [recipeOf("Steel Bar", { Iron: 3, Coal: 1 }, { outputQty: 2 })] }),
  ];

  it("exports recipes as CSV that re-imports cleanly", () => {
    const csv = toCsv("recipes", exportRows("recipes", items));
    const p = parseImport("recipes", "csv", csv, items.map((i) => i.name));
    expect(p.errors).toEqual([]);
    expect(p.rows[0]).toMatchObject({ item: "Steel Bar", outputQty: 2 });
    expect(p.rows[0].ingredients).toEqual([{ item: "Iron", quantity: 3 }, { item: "Coal", quantity: 1 }]);
  });

  it("exports materials and products separately and JSON recipes nested", () => {
    expect(exportRows("materials", items).map((r) => r.name)).toEqual(["Iron", "Coal"]);
    expect(exportRows("products", items).map((r) => r.name)).toEqual(["Steel Bar"]);
    const j = exportJson("recipes", items) as { ingredients: unknown[] }[];
    expect(j[0].ingredients).toHaveLength(2);
    const back = parseImport("materials", "csv", toCsv("materials", exportRows("materials", items)), []);
    expect(back.errors).toEqual([]);
  });
});
