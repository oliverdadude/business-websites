"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { attemptLogin, logout, requireAdmin } from "./auth";
import { getSettings, saveSettings } from "./settings";
import { buildCatalog, loadItems, unverifiedReasons } from "./catalog";
import { OrderActionError, transitionOrder } from "./orders";
import { applyImport, previewImportData } from "./import";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders";
import { findCycles, validateTiers, type Tier } from "@/lib/engine";
import { slugify } from "@/lib/format";
import { fdBool, fdEnum, fdFloat, fdInt, fdIntOrNull, fdStr, FormError, type ActionResult } from "@/lib/form";
import { IMPORT_TYPES, type ImportFormat, type ImportType } from "@/lib/import";

function fail(e: unknown): ActionResult {
  if (e instanceof FormError || e instanceof OrderActionError) return { ok: false, message: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return { ok: false, message: "That name is already used by another item." };
    if (e.code === "P2003") return { ok: false, message: "This is still used elsewhere (orders or recipes), so it can't be removed." };
    if (e.code === "P2025") return { ok: false, message: "Not found. It may have been deleted." };
  }
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
  console.error(e);
  return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
}

// ---------- auth ----------

export async function loginAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await attemptLogin(String(fd.get("password") ?? ""));
  if (!r.ok) return { ok: false, message: r.error };
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

// ---------- orders ----------

function revalidateOrders(id?: string) {
  revalidatePath("/admin", "layout");
  if (id) revalidatePath(`/admin/orders/${id}`);
}

export async function changeStatusAction(orderId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const to = fdEnum(fd, "status", ORDER_STATUSES, "PENDING_APPROVAL") as OrderStatus;
    const note = fdStr(fd, "note", 1000);
    const reason = to === "CANCELLED" ? fdStr(fd, "reason", 500) : "";
    if (to === "CANCELLED" && !reason) throw new FormError("Give a reason for cancelling so the customer knows why.");
    const r = await transitionOrder(orderId, to, note || (reason ? `Cancelled: ${reason}` : ""), reason ? { rejectionReason: reason } : {});
    revalidateOrders(orderId);
    return { ok: true, message: `Order moved to ${r.label}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateOrderDetailsAction(orderId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const exp = fdStr(fd, "expectedDelivery");
    let expectedDelivery: Date | null = null;
    if (exp) {
      expectedDelivery = new Date(exp.length === 16 ? `${exp}:00Z` : exp);
      if (Number.isNaN(expectedDelivery.getTime())) throw new FormError("Invalid expected delivery time");
    }
    await prisma.order.update({
      where: { id: orderId },
      data: { expectedDelivery, adminNotes: fdStr(fd, "adminNotes", 5000), paymentReceived: fdBool(fd, "paymentReceived") },
    });
    revalidateOrders(orderId);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function togglePaymentAction(orderId: string, paid: boolean) {
  await requireAdmin();
  await prisma.order.update({ where: { id: orderId }, data: { paymentReceived: paid } });
  revalidateOrders(orderId);
}

/** Agree a custom total (custom quotes). Recorded on the timeline. */
export async function setQuotedTotalAction(orderId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const total = fdInt(fd, "total", "Total", 0);
    const o = await prisma.order.findUnique({ where: { id: orderId } });
    if (!o) throw new FormError("Order not found");
    if (o.status === "COMPLETED" || o.status === "CANCELLED") throw new FormError("This order is closed.");
    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { total, discountTotal: o.subtotal - total } }),
      prisma.orderEvent.create({ data: { orderId, status: o.status, note: `Price confirmed by the seller: $${total.toLocaleString("en-US")}` } }),
    ]);
    revalidateOrders(orderId);
    return { ok: true, message: "Total updated." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- inventory ----------

export async function adjustStockAction(itemId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const mode = fdEnum(fd, "mode", ["set", "add"] as const, "set");
    const reason = fdStr(fd, "reason", 300);
    if (!reason) throw new FormError("Give a reason for the correction.");
    const value = mode === "set" ? fdInt(fd, "value", "Quantity", 0) : Number(fdStr(fd, "value"));
    if (mode === "add" && (!Number.isInteger(value) || value === 0 || Math.abs(value) > 1e9)) throw new FormError("Enter a whole number change, e.g. 50 or -20");
    await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: { onHand: true } });
      const after = mode === "set" ? value : item.onHand + value;
      if (after < 0) throw new FormError("Stock can't go below zero.");
      const delta = after - item.onHand;
      if (delta === 0) return;
      await tx.item.update({ where: { id: itemId }, data: { onHand: after } });
      await tx.inventoryAdjustment.create({ data: { itemId, delta, reason } });
    });
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Stock updated." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- items ----------

const KINDS = ["RAW", "INTERMEDIATE", "PRODUCT"] as const;
const ACQ = ["PURCHASE", "GATHER", "STOCK"] as const;
const PREF = ["AUTO", "CRAFT", "BUY"] as const;
const VER = ["VERIFIED", "UNVERIFIED"] as const;

function itemFields(fd: FormData) {
  const name = fdStr(fd, "name", 120);
  if (!name) throw new FormError("Name is required");
  return {
    name,
    category: fdStr(fd, "category", 60) || "Uncategorised",
    kind: fdEnum(fd, "kind", KINDS, "RAW"),
    description: fdStr(fd, "description", 2000),
    acquisition: fdEnum(fd, "acquisition", ACQ, "PURCHASE"),
    sourcePreference: fdEnum(fd, "sourcePreference", PREF, "AUTO"),
    buyPrice: fdIntOrNull(fd, "buyPrice", "Buy price"),
    gatherCost: fdIntOrNull(fd, "gatherCost", "Gather cost"),
    marketValue: fdIntOrNull(fd, "marketValue", "Market value"),
    sellPrice: fdIntOrNull(fd, "sellPrice", "Sell price"),
    priceStatus: fdEnum(fd, "priceStatus", VER, "UNVERIFIED"),
    basePrice: fdIntOrNull(fd, "basePrice", "Base selling price"),
    approvedForSale: fdBool(fd, "approvedForSale"),
    featured: fdBool(fd, "featured"),
    popular: fdBool(fd, "popular"),
    minMarginPct: fdFloat(fd, "minMarginPct", "Minimum margin", 0, 99, 15),
    quoteThreshold: fdIntOrNull(fd, "quoteThreshold", "Quote threshold", 1),
    extraCostPerUnit: fdInt(fd, "extraCostPerUnit", "Extra cost per unit", 0, 0),
    lowStockThreshold: fdIntOrNull(fd, "lowStockThreshold", "Low-stock threshold"),
  };
}

async function uniqueSlug(name: string, exceptId?: string) {
  const base = slugify(name);
  for (let i = 0; ; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const hit = await prisma.item.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
  }
}

async function approvalWarnings(itemId: string): Promise<string[]> {
  const [items, s] = await Promise.all([loadItems(), getSettings()]);
  const item = items.find((i) => i.id === itemId);
  return item ? unverifiedReasons(buildCatalog(items), s, item) : [];
}

export async function createItemAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  let id: string;
  try {
    const data = itemFields(fd);
    const s = await getSettings();
    if (data.approvedForSale && data.basePrice === null) throw new FormError("Set a selling price before approving for sale.");
    if (!fd.has("minMarginPct") || fdStr(fd, "minMarginPct") === "") data.minMarginPct = s.defaultMinMarginPct;
    const item = await prisma.item.create({
      data: {
        ...data,
        slug: await uniqueSlug(data.name),
        // New items start with a copy of the default tiers.
        tiers: { create: s.defaultTiers.map((t) => ({ minQty: t.minQty, pct: t.pct })) },
      },
    });
    id = item.id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/items/${id}?created=1`);
}

export async function updateItemAction(itemId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const data = itemFields(fd);
    if (data.approvedForSale && (data.basePrice === null || data.basePrice <= 0)) throw new FormError("Set a selling price above $0 before approving for sale.");
    await prisma.item.update({ where: { id: itemId }, data: { ...data, slug: await uniqueSlug(data.name, itemId) } });
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
    if (data.approvedForSale) {
      const w = await approvalWarnings(itemId);
      if (w.length) return { ok: true, message: `Saved and approved for sale, but check: ${w.join("; ")}.` };
    }
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

/** Inline price edits from the items table. */
export async function quickUpdateItemAction(itemId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const data = {
      buyPrice: fdIntOrNull(fd, "buyPrice", "Buy price"),
      gatherCost: fdIntOrNull(fd, "gatherCost", "Gather cost"),
      marketValue: fdIntOrNull(fd, "marketValue", "Market value"),
      sellPrice: fdIntOrNull(fd, "sellPrice", "Sell price"),
      basePrice: fdIntOrNull(fd, "basePrice", "Base price"),
      priceStatus: fdEnum(fd, "priceStatus", VER, "UNVERIFIED"),
    };
    const cur = await prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: { approvedForSale: true } });
    if (cur.approvedForSale && (data.basePrice === null || data.basePrice <= 0)) {
      throw new FormError("This item is approved for sale: keep a selling price, or un-approve it first.");
    }
    await prisma.item.update({ where: { id: itemId }, data });
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteItemAction(itemId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const [lines, uses] = await Promise.all([
      prisma.orderLine.count({ where: { itemId } }),
      prisma.recipeIngredient.count({ where: { itemId } }),
    ]);
    if (lines) throw new FormError(`Used in ${lines} order line(s). Un-approve it instead of deleting.`);
    if (uses) throw new FormError(`Used as an ingredient in ${uses} recipe(s). Remove it from those recipes first.`);
    await prisma.$transaction([
      prisma.reservation.deleteMany({ where: { itemId } }),
      prisma.item.delete({ where: { id: itemId } }),
    ]);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/items?deleted=1");
}

// ---------- recipes ----------

export async function saveRecipeAction(itemId: string, recipeId: string | null, _: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const name = fdStr(fd, "name", 60) || "Primary";
    let ingredients: { itemId: string; quantity: number }[];
    try {
      ingredients = JSON.parse(fdStr(fd, "ingredients", 20000) || "[]");
    } catch {
      throw new FormError("Invalid ingredient list");
    }
    if (!Array.isArray(ingredients) || ingredients.length === 0) throw new FormError("Add at least one ingredient.");
    const seen = new Set<string>();
    for (const g of ingredients) {
      if (typeof g.itemId !== "string" || !g.itemId) throw new FormError("Pick an item for every ingredient row.");
      if (!Number.isInteger(g.quantity) || g.quantity < 1 || g.quantity > 1_000_000) throw new FormError("Ingredient quantities must be whole numbers of 1 or more.");
      if (g.itemId === itemId) throw new FormError("An item can't be an ingredient of itself.");
      if (seen.has(g.itemId)) throw new FormError("Each ingredient can only appear once per recipe. Combine the quantities.");
      seen.add(g.itemId);
    }
    const found = await prisma.item.count({ where: { id: { in: [...seen] } } });
    if (found !== seen.size) throw new FormError("An ingredient no longer exists. Reload the page.");

    const data = {
      name,
      outputQty: fdInt(fd, "outputQty", "Output per craft", 1, 1),
      craftSeconds: fdIntOrNull(fd, "craftSeconds", "Craft time"),
      station: fdStr(fd, "station", 80) || null,
      skill: fdStr(fd, "skill", 80) || null,
      skillLevel: fdIntOrNull(fd, "skillLevel", "Skill level"),
      extraCostPerBatch: fdInt(fd, "extraCostPerBatch", "Extra cost per batch", 0, 0),
      status: fdEnum(fd, "status", VER, "UNVERIFIED"),
      notes: fdStr(fd, "notes", 2000),
    };
    const makePrimary = fdBool(fd, "isPrimary");

    // Check the change doesn't create a loop with no way out.
    const items = await loadItems();
    const draftId = recipeId ?? "__draft__";
    for (const it of items) {
      if (it.id !== itemId) continue;
      const others = it.recipes.filter((r) => r.id !== recipeId);
      it.recipes = [
        ...others,
        { ...others[0], ...data, id: draftId, itemId, isPrimary: makePrimary, createdAt: new Date(), updatedAt: new Date(), ingredients: ingredients.map((g, i) => ({ id: `d${i}`, recipeId: draftId, ...g })) },
      ] as typeof it.recipes;
    }
    const cycles = findCycles(buildCatalog(items));
    const relevant = cycles.filter((c) => c.includes(items.find((i) => i.id === itemId)!.name));

    await prisma.$transaction(async (tx) => {
      const existingCount = await tx.recipe.count({ where: { itemId } });
      const isPrimary = makePrimary || existingCount === 0 || (recipeId !== null && existingCount === 1);
      if (isPrimary) await tx.recipe.updateMany({ where: { itemId }, data: { isPrimary: false } });
      if (recipeId) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId } });
        await tx.recipe.update({ where: { id: recipeId }, data: { ...data, isPrimary: isPrimary || undefined, ingredients: { create: ingredients } } });
      } else {
        await tx.recipe.create({ data: { ...data, itemId, isPrimary, ingredients: { create: ingredients } } });
      }
    });
    revalidatePath("/admin", "layout");
    if (relevant.length) {
      return { ok: true, message: `Saved, but this creates a circular dependency: ${relevant.map((c) => c.join(" → ")).join("; ")}. The planner will skip it only if another recipe exists.` };
    }
    return { ok: true, message: "Recipe saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRecipeAction(recipeId: string) {
  await requireAdmin();
  const r = await prisma.recipe.delete({ where: { id: recipeId } });
  if (r.isPrimary) {
    const next = await prisma.recipe.findFirst({ where: { itemId: r.itemId }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.recipe.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  revalidatePath("/admin", "layout");
}

export async function makePrimaryRecipeAction(recipeId: string) {
  await requireAdmin();
  const r = await prisma.recipe.findUniqueOrThrow({ where: { id: recipeId } });
  await prisma.$transaction([
    prisma.recipe.updateMany({ where: { itemId: r.itemId }, data: { isPrimary: false } }),
    prisma.recipe.update({ where: { id: recipeId }, data: { isPrimary: true } }),
  ]);
  revalidatePath("/admin", "layout");
}

// ---------- tiers ----------

function parseTiers(fd: FormData): Tier[] {
  let tiers: Tier[];
  try {
    tiers = JSON.parse(fdStr(fd, "tiers", 10000) || "[]");
  } catch {
    throw new FormError("Invalid tier list");
  }
  if (!Array.isArray(tiers) || tiers.length > 30) throw new FormError("Invalid tier list");
  tiers = tiers.map((t) => ({ minQty: Number(t.minQty), pct: Number(t.pct) }));
  const err = validateTiers(tiers);
  if (err) throw new FormError(err);
  return tiers.sort((a, b) => a.minQty - b.minQty);
}

export async function saveTiersAction(itemId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const tiers = fdBool(fd, "reset") ? (await getSettings()).defaultTiers : parseTiers(fd);
    await prisma.$transaction([
      prisma.discountTier.deleteMany({ where: { itemId } }),
      prisma.discountTier.createMany({ data: tiers.map((t) => ({ itemId, minQty: t.minQty, pct: t.pct })) }),
    ]);
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
    return { ok: true, message: "Discount tiers saved." };
  } catch (e) {
    return fail(e);
  }
}

// ---------- settings ----------

export async function saveSettingsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const businessName = fdStr(fd, "businessName", 80);
    if (!businessName) throw new FormError("Business name is required");
    await saveSettings({
      businessName,
      sellerDiscord: fdStr(fd, "sellerDiscord", 60),
      ordersOpen: fdBool(fd, "ordersOpen"),
      valueGatheredAtMarket: fdBool(fd, "valueGatheredAtMarket"),
      valueStockAtMarket: fdBool(fd, "valueStockAtMarket"),
      defaultMinMarginPct: fdFloat(fd, "defaultMinMarginPct", "Default minimum margin", 0, 99, 15),
      defaultQuoteThreshold: fdIntOrNull(fd, "defaultQuoteThreshold", "Default quote threshold", 1),
      extraCostPerOrder: fdInt(fd, "extraCostPerOrder", "Extra cost per order", 0, 0),
      defaultTiers: parseTiers(fd),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function applyDefaultTiersToAllAction(_?: ActionResult, __?: FormData): Promise<ActionResult> {
  await requireAdmin();
  const s = await getSettings();
  const items = await prisma.item.findMany({ where: { kind: { not: "RAW" } }, select: { id: true } });
  await prisma.$transaction([
    prisma.discountTier.deleteMany({ where: { itemId: { in: items.map((i) => i.id) } } }),
    prisma.discountTier.createMany({ data: items.flatMap((i) => s.defaultTiers.map((t) => ({ itemId: i.id, minQty: t.minQty, pct: t.pct }))) }),
  ]);
  revalidatePath("/", "layout");
  return { ok: true, message: `Default tiers copied to ${items.length} item(s).` };
}

// ---------- demo data ----------

export async function deleteDemoDataAction(_?: ActionResult, __?: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const demo = await prisma.item.findMany({ where: { isDemo: true }, select: { id: true } });
    const ids = demo.map((d) => d.id);
    if (ids.length === 0) return { ok: true, message: "There is no demo data." };
    const orders = await prisma.order.findMany({ where: { lines: { some: { itemId: { in: ids } } } }, select: { id: true } });
    await prisma.$transaction([
      prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } }),
      prisma.reservation.deleteMany({ where: { itemId: { in: ids } } }),
      prisma.recipeIngredient.deleteMany({ where: { itemId: { in: ids } } }),
      prisma.item.deleteMany({ where: { id: { in: ids } } }),
    ]);
    revalidatePath("/", "layout");
    return { ok: true, message: `Deleted ${ids.length} demo item(s) and ${orders.length} order(s) that used them.` };
  } catch (e) {
    return fail(e);
  }
}

// ---------- import ----------

function importArgs(fd: FormData): { type: ImportType; format: ImportFormat; text: string } {
  const type = fdEnum(fd, "type", IMPORT_TYPES, "materials");
  const format = fdEnum(fd, "format", ["csv", "json"] as const, "csv");
  const v = fd.get("text");
  const text = typeof v === "string" ? v : "";
  if (!text.trim()) throw new FormError("Paste data or choose a file first.");
  if (text.length > 2_000_000) throw new FormError("File is too large (2 MB max).");
  return { type, format, text };
}

export async function previewImportAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const { type, format, text } = importArgs(fd);
    const preview = await previewImportData(type, format, text);
    return { ok: preview.errors.length === 0, message: preview.errors.length ? `${preview.errors.length} problem(s) found. Nothing was saved.` : "Looks good. Review and confirm below.", data: preview };
  } catch (e) {
    return fail(e);
  }
}

export async function commitImportAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const { type, format, text } = importArgs(fd);
    const summary = await applyImport(type, format, text);
    revalidatePath("/", "layout");
    return { ok: true, message: summary };
  } catch (e) {
    return fail(e);
  }
}
