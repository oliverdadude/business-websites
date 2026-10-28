// CSV / JSON import parsing and validation, plus export row builders. Pure: the server
// supplies the names of existing items and applies the parsed result in a transaction.
import Papa from "papaparse";
import type { FullItem } from "./catalog-core";

export const IMPORT_TYPES = ["materials", "products", "recipes", "prices", "inventory"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];
export type ImportFormat = "csv" | "json";

const KINDS = ["RAW", "INTERMEDIATE", "PRODUCT"] as const;
const ACQ = ["PURCHASE", "GATHER", "STOCK"] as const;
const PREF = ["AUTO", "CRAFT", "BUY"] as const;
const VER = ["VERIFIED", "UNVERIFIED"] as const;

export const ITEM_COLUMNS = [
  "name", "category", "kind", "description", "acquisition", "sourcePreference",
  "buyPrice", "gatherCost", "marketValue", "sellPrice", "priceStatus",
  "basePrice", "approvedForSale", "featured", "popular", "minMarginPct",
  "quoteThreshold", "extraCostPerUnit", "lowStockThreshold",
] as const;
export const RECIPE_COLUMNS = [
  "item", "recipe", "isPrimary", "outputQty", "craftSeconds", "station", "skill",
  "skillLevel", "extraCostPerBatch", "status", "notes", "ingredient", "quantity",
] as const;
export const PRICE_COLUMNS = ["name", "buyPrice", "gatherCost", "marketValue", "sellPrice", "basePrice", "priceStatus"] as const;
export const INVENTORY_COLUMNS = ["name", "onHand", "reason"] as const;

export const COLUMNS: Record<ImportType, readonly string[]> = {
  materials: ITEM_COLUMNS,
  products: ITEM_COLUMNS,
  recipes: RECIPE_COLUMNS,
  prices: PRICE_COLUMNS,
  inventory: INVENTORY_COLUMNS,
};

export interface ItemRow {
  name: string;
  category?: string;
  kind?: (typeof KINDS)[number];
  description?: string;
  acquisition?: (typeof ACQ)[number];
  sourcePreference?: (typeof PREF)[number];
  buyPrice?: number | null;
  gatherCost?: number | null;
  marketValue?: number | null;
  sellPrice?: number | null;
  priceStatus?: (typeof VER)[number];
  basePrice?: number | null;
  approvedForSale?: boolean;
  featured?: boolean;
  popular?: boolean;
  minMarginPct?: number;
  quoteThreshold?: number | null;
  extraCostPerUnit?: number;
  lowStockThreshold?: number | null;
}

export interface RecipeRow {
  item: string;
  recipe: string;
  isPrimary: boolean;
  outputQty: number;
  craftSeconds: number | null;
  station: string | null;
  skill: string | null;
  skillLevel: number | null;
  extraCostPerBatch: number;
  status: (typeof VER)[number];
  notes: string;
  ingredients: { item: string; quantity: number }[];
}

export interface PriceRow {
  name: string;
  buyPrice?: number | null;
  gatherCost?: number | null;
  marketValue?: number | null;
  sellPrice?: number | null;
  basePrice?: number | null;
  priceStatus?: (typeof VER)[number];
}

export interface InventoryRow {
  name: string;
  onHand: number;
  reason: string;
}

export interface ImportIssue {
  row: number; // 1-based data row (CSV header excluded)
  field?: string;
  message: string;
}

export type ParsedImport =
  | { type: "materials" | "products"; rows: ItemRow[]; errors: ImportIssue[]; warnings: ImportIssue[] }
  | { type: "recipes"; rows: RecipeRow[]; errors: ImportIssue[]; warnings: ImportIssue[] }
  | { type: "prices"; rows: PriceRow[]; errors: ImportIssue[]; warnings: ImportIssue[] }
  | { type: "inventory"; rows: InventoryRow[]; errors: ImportIssue[]; warnings: ImportIssue[] };

type Raw = Record<string, unknown>;

/** Reads CSV or JSON text into flat records. Nested recipe JSON is flattened to one row per ingredient. */
export function readRecords(text: string, format: ImportFormat): { records: Raw[]; errors: ImportIssue[] } {
  if (format === "json") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { records: [], errors: [{ row: 0, message: `Invalid JSON: ${e instanceof Error ? e.message : e}` }] };
    }
    if (!Array.isArray(data)) return { records: [], errors: [{ row: 0, message: "JSON must be an array of objects" }] };
    const records: Raw[] = [];
    data.forEach((r, i) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        records.push({ __invalid: `Entry ${i + 1} is not an object` });
        return;
      }
      const o = r as Raw;
      if (Array.isArray(o.ingredients)) {
        const { ingredients, ...rest } = o;
        const base = { ...rest, recipe: rest.recipe ?? rest.name };
        if ((ingredients as unknown[]).length === 0) records.push(base);
        for (const g of ingredients as Raw[]) {
          records.push({ ...base, ingredient: g?.ingredient ?? g?.item ?? g?.name, quantity: g?.quantity });
        }
      } else records.push(o);
    });
    return { records, errors: [] };
  }
  const res = Papa.parse<Raw>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const errors = res.errors.map((e) => ({ row: (e.row ?? -1) + 1, message: `CSV: ${e.message}` }));
  return { records: res.data, errors };
}

class FieldError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

/** Whole non-negative number; "", undefined → undefined; "none"/"null"/"-" → null (clear). */
function int(r: Raw, f: string, opts: { min?: number; nullable?: boolean } = {}): number | null | undefined {
  const raw = r[f];
  if (typeof raw === "number") return check(raw);
  const s = str(raw);
  if (s === undefined) return undefined;
  if (["none", "null", "-"].includes(s.toLowerCase())) {
    if (opts.nullable === false) throw new FieldError(f, `${f} can't be cleared`);
    return null;
  }
  const n = Number(s.replace(/[$,\s]/g, ""));
  return check(n);
  function check(n: number) {
    if (!Number.isFinite(n) || !Number.isInteger(n)) throw new FieldError(f, `${f} must be a whole number`);
    if (n < (opts.min ?? 0)) throw new FieldError(f, `${f} must be at least ${opts.min ?? 0}`);
    if (n > 2_000_000_000) throw new FieldError(f, `${f} is too large`);
    return n;
  }
}

function float(r: Raw, f: string, min: number, max: number): number | undefined {
  const s = str(r[f]);
  if (s === undefined) return undefined;
  const n = Number(s.replace(/[%\s]/g, ""));
  if (!Number.isFinite(n) || n < min || n > max) throw new FieldError(f, `${f} must be between ${min} and ${max}`);
  return n;
}

function bool(r: Raw, f: string): boolean | undefined {
  const v = r[f];
  if (typeof v === "boolean") return v;
  const s = str(v)?.toLowerCase();
  if (s === undefined) return undefined;
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  throw new FieldError(f, `${f} must be true or false`);
}

function oneOf<T extends string>(r: Raw, f: string, values: readonly T[]): T | undefined {
  const s = str(r[f])?.toUpperCase();
  if (s === undefined) return undefined;
  if (!(values as readonly string[]).includes(s)) throw new FieldError(f, `${f} must be one of ${values.join(", ")}`);
  return s as T;
}

function unknownColumns(records: Raw[], type: ImportType): ImportIssue[] {
  const allowed = new Set(COLUMNS[type]);
  const extra = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) if (!allowed.has(k) && k !== "__invalid" && k !== "slug" && k !== "id") extra.add(k);
  return extra.size ? [{ row: 0, message: `Ignored unknown columns: ${[...extra].join(", ")}` }] : [];
}

const lc = (s: string) => s.trim().toLowerCase();

function parseItemRow(r: Raw, type: "materials" | "products"): ItemRow {
  const name = str(r.name);
  if (!name) throw new FieldError("name", "name is required");
  if (name.length > 120) throw new FieldError("name", "name is too long");
  let kind = oneOf(r, "kind", KINDS);
  if (type === "materials") {
    if (kind && kind !== "RAW") throw new FieldError("kind", "materials must have kind RAW (use the products import)");
    kind = "RAW";
  } else {
    if (kind === "RAW") throw new FieldError("kind", "products must be INTERMEDIATE or PRODUCT (use the materials import)");
    kind = kind ?? "PRODUCT";
  }
  const row: ItemRow = {
    name,
    category: str(r.category),
    kind,
    description: str(r.description),
    acquisition: oneOf(r, "acquisition", ACQ),
    sourcePreference: oneOf(r, "sourcePreference", PREF),
    buyPrice: int(r, "buyPrice"),
    gatherCost: int(r, "gatherCost"),
    marketValue: int(r, "marketValue"),
    sellPrice: int(r, "sellPrice"),
    priceStatus: oneOf(r, "priceStatus", VER),
    basePrice: int(r, "basePrice"),
    approvedForSale: bool(r, "approvedForSale"),
    featured: bool(r, "featured"),
    popular: bool(r, "popular"),
    minMarginPct: float(r, "minMarginPct", 0, 99),
    quoteThreshold: int(r, "quoteThreshold", { min: 1 }),
    extraCostPerUnit: int(r, "extraCostPerUnit", { nullable: false }) ?? undefined,
    lowStockThreshold: int(r, "lowStockThreshold"),
  };
  for (const k of Object.keys(row) as (keyof ItemRow)[]) if (row[k] === undefined) delete row[k];
  return row;
}

function parsePriceRow(r: Raw): PriceRow {
  const name = str(r.name);
  if (!name) throw new FieldError("name", "name is required");
  const row: PriceRow = {
    name,
    buyPrice: int(r, "buyPrice"),
    gatherCost: int(r, "gatherCost"),
    marketValue: int(r, "marketValue"),
    sellPrice: int(r, "sellPrice"),
    basePrice: int(r, "basePrice"),
    priceStatus: oneOf(r, "priceStatus", VER),
  };
  for (const k of Object.keys(row) as (keyof PriceRow)[]) if (row[k] === undefined) delete row[k];
  return row;
}

/**
 * Parses and validates an import file.
 * @param existingNames names of items already in the database (any case).
 */
export function parseImport(type: ImportType, format: ImportFormat, text: string, existingNames: Iterable<string>): ParsedImport {
  const known = new Set([...existingNames].map(lc));
  const { records, errors } = readRecords(text, format);
  const warnings: ImportIssue[] = unknownColumns(records, type);
  if (records.length === 0 && errors.length === 0) errors.push({ row: 0, message: "The file has no rows" });

  const each = <T>(fn: (r: Raw, row: number) => T): T[] => {
    const out: T[] = [];
    records.forEach((r, i) => {
      const row = i + 1;
      if (typeof r.__invalid === "string") {
        errors.push({ row, message: r.__invalid });
        return;
      }
      try {
        out.push(fn(r, row));
      } catch (e) {
        if (e instanceof FieldError) errors.push({ row, field: e.field, message: e.message });
        else errors.push({ row, message: e instanceof Error ? e.message : String(e) });
      }
    });
    return out;
  };

  if (type === "materials" || type === "products") {
    const seen = new Map<string, number>();
    const rows = each((r, row) => {
      const parsed = parseItemRow(r, type);
      const prev = seen.get(lc(parsed.name));
      if (prev) throw new FieldError("name", `Duplicate of row ${prev}`);
      seen.set(lc(parsed.name), row);
      return parsed;
    });
    return { type, rows, errors, warnings };
  }

  if (type === "prices" || type === "inventory") {
    const seen = new Map<string, number>();
    const rows = each((r, row) => {
      const parsed =
        type === "prices"
          ? parsePriceRow(r)
          : (() => {
              const name = str(r.name);
              if (!name) throw new FieldError("name", "name is required");
              const onHand = int(r, "onHand", { nullable: false });
              if (onHand === undefined || onHand === null) throw new FieldError("onHand", "onHand is required");
              return { name, onHand, reason: str(r.reason) ?? "Imported inventory count" } satisfies InventoryRow;
            })();
      if (!known.has(lc(parsed.name))) throw new FieldError("name", `No item called "${parsed.name}"`);
      const prev = seen.get(lc(parsed.name));
      if (prev) throw new FieldError("name", `Duplicate of row ${prev}`);
      seen.set(lc(parsed.name), row);
      return parsed;
    });
    return type === "prices"
      ? { type, rows: rows as PriceRow[], errors, warnings }
      : { type, rows: rows as InventoryRow[], errors, warnings };
  }

  // Recipes: one row per ingredient, grouped by item + recipe name.
  const groups = new Map<string, { recipe: RecipeRow; firstRow: number; ingRows: Map<string, number> }>();
  each((r, row) => {
    const item = str(r.item);
    if (!item) throw new FieldError("item", "item is required");
    if (!known.has(lc(item))) throw new FieldError("item", `No item called "${item}"`);
    const recipeName = str(r.recipe) ?? "Primary";
    const key = `${lc(item)}\u0000${lc(recipeName)}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        firstRow: row,
        ingRows: new Map(),
        recipe: {
          item,
          recipe: recipeName,
          isPrimary: bool(r, "isPrimary") ?? false,
          outputQty: int(r, "outputQty", { min: 1, nullable: false }) ?? 1,
          craftSeconds: int(r, "craftSeconds") ?? null,
          station: str(r.station) ?? null,
          skill: str(r.skill) ?? null,
          skillLevel: int(r, "skillLevel") ?? null,
          extraCostPerBatch: int(r, "extraCostPerBatch", { nullable: false }) ?? 0,
          status: oneOf(r, "status", VER) ?? "UNVERIFIED",
          notes: str(r.notes) ?? "",
          ingredients: [],
        },
      };
      groups.set(key, g);
    }
    const ing = str(r.ingredient);
    if (!ing) {
      if (str(r.quantity)) throw new FieldError("ingredient", "quantity given without an ingredient");
      return null;
    }
    if (!known.has(lc(ing))) throw new FieldError("ingredient", `No item called "${ing}"`);
    if (lc(ing) === lc(item)) throw new FieldError("ingredient", `${item} can't be an ingredient of itself`);
    const q = int(r, "quantity", { min: 1, nullable: false });
    if (q === undefined || q === null) throw new FieldError("quantity", "quantity is required");
    const prev = g.ingRows.get(lc(ing));
    if (prev) throw new FieldError("ingredient", `${ing} is already listed on row ${prev} for this recipe`);
    g.ingRows.set(lc(ing), row);
    g.recipe.ingredients.push({ item: ing, quantity: q });
    return null;
  });
  const rows = [...groups.values()].map((g) => g.recipe);
  for (const g of groups.values()) {
    if (g.recipe.ingredients.length === 0) errors.push({ row: g.firstRow, message: `Recipe "${g.recipe.recipe}" for ${g.recipe.item} has no ingredients` });
  }
  // Exactly one primary per item among imported recipes: if none flagged, the first is primary.
  const byItem = new Map<string, RecipeRow[]>();
  for (const r of rows) byItem.set(lc(r.item), [...(byItem.get(lc(r.item)) ?? []), r]);
  for (const list of byItem.values()) {
    const primaries = list.filter((r) => r.isPrimary);
    if (primaries.length === 0) list[0].isPrimary = true;
    if (primaries.length > 1) warnings.push({ row: 0, message: `${list[0].item} has several primary recipes; only "${primaries[0].recipe}" stays primary` });
    primaries.slice(1).forEach((r) => (r.isPrimary = false));
  }
  return { type, rows, errors, warnings };
}

// ---------- export ----------

const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : v);

export function exportRows(type: ImportType, items: FullItem[]): Record<string, unknown>[] {
  const nameOf = new Map(items.map((i) => [i.id, i.name]));
  switch (type) {
    case "materials":
    case "products":
      return items
        .filter((i) => (type === "materials" ? i.kind === "RAW" : i.kind !== "RAW"))
        .map((i) => ({
          name: i.name, category: i.category, kind: i.kind, description: i.description,
          acquisition: i.acquisition, sourcePreference: i.sourcePreference,
          buyPrice: n(i.buyPrice), gatherCost: n(i.gatherCost), marketValue: n(i.marketValue), sellPrice: n(i.sellPrice),
          priceStatus: i.priceStatus, basePrice: n(i.basePrice), approvedForSale: i.approvedForSale,
          featured: i.featured, popular: i.popular, minMarginPct: i.minMarginPct,
          quoteThreshold: n(i.quoteThreshold), extraCostPerUnit: i.extraCostPerUnit, lowStockThreshold: n(i.lowStockThreshold),
        }));
    case "recipes":
      return items.flatMap((i) =>
        i.recipes.flatMap((r) =>
          r.ingredients.map((g) => ({
            item: i.name, recipe: r.name, isPrimary: r.isPrimary, outputQty: r.outputQty,
            craftSeconds: n(r.craftSeconds), station: r.station ?? "", skill: r.skill ?? "", skillLevel: n(r.skillLevel),
            extraCostPerBatch: r.extraCostPerBatch, status: r.status, notes: r.notes,
            ingredient: nameOf.get(g.itemId) ?? g.itemId, quantity: g.quantity,
          })),
        ),
      );
    case "prices":
      return items.map((i) => ({
        name: i.name, buyPrice: n(i.buyPrice), gatherCost: n(i.gatherCost), marketValue: n(i.marketValue),
        sellPrice: n(i.sellPrice), basePrice: n(i.basePrice), priceStatus: i.priceStatus,
      }));
    case "inventory":
      return items.map((i) => ({ name: i.name, onHand: i.onHand, reason: "" }));
  }
}

/** JSON export: recipes are nested (one object per recipe), everything else is flat. */
export function exportJson(type: ImportType, items: FullItem[]): unknown[] {
  if (type !== "recipes") return exportRows(type, items);
  const nameOf = new Map(items.map((i) => [i.id, i.name]));
  return items.flatMap((i) =>
    i.recipes.map((r) => ({
      item: i.name, recipe: r.name, isPrimary: r.isPrimary, outputQty: r.outputQty, craftSeconds: r.craftSeconds,
      station: r.station, skill: r.skill, skillLevel: r.skillLevel, extraCostPerBatch: r.extraCostPerBatch,
      status: r.status, notes: r.notes,
      ingredients: r.ingredients.map((g) => ({ item: nameOf.get(g.itemId) ?? g.itemId, quantity: g.quantity })),
    })),
  );
}

export function toCsv(type: ImportType, rows: Record<string, unknown>[]): string {
  return Papa.unparse({ fields: [...COLUMNS[type]], data: rows.map((r) => COLUMNS[type].map((c) => r[c] ?? "")) });
}
