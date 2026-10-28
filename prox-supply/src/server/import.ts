import "server-only";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { buildCatalog, loadItems, type FullItem } from "./catalog";
import { findCycles } from "@/lib/engine";
import { slugify } from "@/lib/format";
import { FormError } from "@/lib/form";
import { parseImport, type ImportFormat, type ImportType, type ParsedImport } from "@/lib/import";
import type { ImportPreview } from "./import-types";
export type { ImportPreview };

const lc = (s: string) => s.trim().toLowerCase();


async function parseWithDb(type: ImportType, format: ImportFormat, text: string, items: FullItem[]) {
  const byName = new Map(items.map((i) => [lc(i.name), i]));
  const parsed = parseImport(type, format, text, items.map((i) => i.name));
  // Kind conflicts need the database.
  if (parsed.type === "materials" || parsed.type === "products") {
    parsed.rows.forEach((r, idx) => {
      const ex = byName.get(lc(r.name));
      if (!ex) return;
      if (parsed.type === "materials" && ex.kind !== "RAW") parsed.errors.push({ row: idx + 1, field: "name", message: `${ex.name} exists as ${ex.kind}; use the products import` });
      if (parsed.type === "products" && ex.kind === "RAW") parsed.errors.push({ row: idx + 1, field: "name", message: `${ex.name} exists as a raw material; use the materials import` });
    });
  }
  return { parsed, byName };
}

/** Catalog as it would look after the recipe import, for cycle checks. */
function withImportedRecipes(items: FullItem[], parsed: Extract<ParsedImport, { type: "recipes" }>): FullItem[] {
  const byName = new Map(items.map((i) => [lc(i.name), i]));
  const copy = items.map((i) => ({ ...i, recipes: [...i.recipes] }));
  const copyByName = new Map(copy.map((i) => [lc(i.name), i]));
  parsed.rows.forEach((r, idx) => {
    const it = copyByName.get(lc(r.item));
    if (!it) return;
    const ingredients = r.ingredients
      .map((g, j) => ({ id: `imp${idx}-${j}`, recipeId: `imp${idx}`, itemId: byName.get(lc(g.item))?.id ?? "", quantity: g.quantity }))
      .filter((g) => g.itemId);
    const others = it.recipes.filter((x) => lc(x.name) !== lc(r.recipe));
    it.recipes = [
      ...others,
      {
        id: `imp${idx}`, itemId: it.id, name: r.recipe, isPrimary: r.isPrimary, outputQty: r.outputQty, craftSeconds: r.craftSeconds,
        station: r.station, skill: r.skill, skillLevel: r.skillLevel, extraCostPerBatch: r.extraCostPerBatch, status: r.status,
        notes: r.notes, createdAt: new Date(), updatedAt: new Date(), ingredients,
      },
    ];
  });
  return copy;
}

export async function previewImportData(type: ImportType, format: ImportFormat, text: string): Promise<ImportPreview> {
  const items = await loadItems();
  const { parsed, byName } = await parseWithDb(type, format, text, items);
  let creates = 0, updates = 0;
  let cycles: string[][] = [];
  if (parsed.type === "materials" || parsed.type === "products") {
    for (const r of parsed.rows) (byName.has(lc(r.name)) ? updates++ : creates++);
  } else if (parsed.type === "recipes") {
    for (const r of parsed.rows) {
      const it = byName.get(lc(r.item));
      (it?.recipes.some((x) => lc(x.name) === lc(r.recipe)) ? updates++ : creates++);
    }
    cycles = findCycles(buildCatalog(withImportedRecipes(items, parsed)));
  } else updates = parsed.rows.length;
  return {
    type,
    rowCount: parsed.rows.length,
    creates,
    updates,
    errors: parsed.errors.slice(0, 200),
    warnings: parsed.warnings,
    cycles,
    sample: (parsed.rows as unknown as Record<string, unknown>[]).slice(0, 50),
  };
}

export async function applyImport(type: ImportType, format: ImportFormat, text: string): Promise<string> {
  const items = await loadItems();
  const { parsed, byName } = await parseWithDb(type, format, text, items);
  if (parsed.errors.length) {
    throw new FormError(`Import has ${parsed.errors.length} problem(s); fix them first. First: row ${parsed.errors[0].row}: ${parsed.errors[0].message}`);
  }
  const s = await getSettings();

  if (parsed.type === "materials" || parsed.type === "products") {
    const slugs = new Set(items.map((i) => i.slug));
    let created = 0, updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const r of parsed.rows) {
        const ex = byName.get(lc(r.name));
        const { name, ...fields } = r;
        if (ex) {
          await tx.item.update({ where: { id: ex.id }, data: fields });
          updated++;
        } else {
          let slug = slugify(name);
          for (let i = 2; slugs.has(slug); i++) slug = `${slugify(name)}-${i}`;
          slugs.add(slug);
          if (fields.approvedForSale && !fields.basePrice) fields.approvedForSale = false;
          await tx.item.create({
            data: {
              name, slug, ...fields,
              minMarginPct: fields.minMarginPct ?? s.defaultMinMarginPct,
              tiers: fields.kind !== "RAW" ? { create: s.defaultTiers.map((t) => ({ minQty: t.minQty, pct: t.pct })) } : undefined,
            },
          });
          created++;
        }
      }
    });
    return `Imported ${parsed.type}: ${created} created, ${updated} updated.`;
  }

  if (parsed.type === "recipes") {
    let created = 0, updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const r of parsed.rows) {
        const it = byName.get(lc(r.item))!;
        const ingredients = r.ingredients.map((g) => ({ itemId: byName.get(lc(g.item))!.id, quantity: g.quantity }));
        const fields = {
          name: r.recipe, outputQty: r.outputQty, craftSeconds: r.craftSeconds, station: r.station, skill: r.skill,
          skillLevel: r.skillLevel, extraCostPerBatch: r.extraCostPerBatch, status: r.status, notes: r.notes,
        };
        const hasAny = (await tx.recipe.count({ where: { itemId: it.id } })) > 0;
        const isPrimary = r.isPrimary || !hasAny;
        if (isPrimary) await tx.recipe.updateMany({ where: { itemId: it.id }, data: { isPrimary: false } });
        const ex = await tx.recipe.findFirst({ where: { itemId: it.id, name: { equals: r.recipe, mode: "insensitive" } } });
        if (ex) {
          await tx.recipeIngredient.deleteMany({ where: { recipeId: ex.id } });
          await tx.recipe.update({ where: { id: ex.id }, data: { ...fields, ...(isPrimary ? { isPrimary: true } : {}), ingredients: { create: ingredients } } });
          updated++;
        } else {
          await tx.recipe.create({ data: { ...fields, itemId: it.id, isPrimary, ingredients: { create: ingredients } } });
          created++;
        }
      }
    });
    return `Imported recipes: ${created} created, ${updated} replaced.`;
  }

  if (parsed.type === "prices") {
    await prisma.$transaction(
      parsed.rows.map(({ name, ...fields }) => prisma.item.update({ where: { id: byName.get(lc(name))!.id }, data: fields })),
    );
    return `Updated prices for ${parsed.rows.length} item(s).`;
  }

  let changed = 0;
  const invRows = parsed.type === "inventory" ? parsed.rows : [];
  await prisma.$transaction(async (tx) => {
    for (const r of invRows) {
      const it = byName.get(lc(r.name))!;
      const cur = await tx.item.findUniqueOrThrow({ where: { id: it.id }, select: { onHand: true } });
      const delta = r.onHand - cur.onHand;
      if (delta === 0) continue;
      await tx.item.update({ where: { id: it.id }, data: { onHand: r.onHand } });
      await tx.inventoryAdjustment.create({ data: { itemId: it.id, delta, reason: r.reason } });
      changed++;
    }
  });
  return `Inventory import: ${changed} item(s) changed.`;
}
