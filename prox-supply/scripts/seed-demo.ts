// Clearly labelled DEMO data so you can try the workflow. Not real Proximity RP recipes or prices.
// Remove it any time from Admin → Settings → Delete demo data.
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const TIERS = [
  { minQty: 10, pct: 3 },
  { minQty: 50, pct: 5 },
  { minQty: 100, pct: 8 },
  { minQty: 500, pct: 12 },
];

type Def = Omit<Prisma.ItemCreateInput, "slug" | "isDemo"> & { key: string };

const ITEMS: Def[] = [
  { key: "D", name: "Demo: Item D", category: "Demo materials", kind: "RAW", acquisition: "PURCHASE", buyPrice: 2, marketValue: 3, priceStatus: "VERIFIED", onHand: 500, lowStockThreshold: 200 },
  { key: "C", name: "Demo: Item C", category: "Demo materials", kind: "RAW", acquisition: "PURCHASE", buyPrice: 5, marketValue: 6, priceStatus: "VERIFIED" },
  { key: "B", name: "Demo: Item B", category: "Demo components", kind: "INTERMEDIATE", acquisition: "PURCHASE", buyPrice: 12, marketValue: 12, priceStatus: "VERIFIED", onHand: 20 },
  { key: "E", name: "Demo: Item E", category: "Demo components", kind: "INTERMEDIATE", acquisition: "STOCK", marketValue: 3, priceStatus: "VERIFIED" },
  { key: "A", name: "Demo: Item A", category: "Demo products", kind: "PRODUCT", basePrice: 60, approvedForSale: true, featured: true, priceStatus: "VERIFIED", onHand: 5, description: "Demo product: 3 × Item B + 2 × Item C." },
  { key: "F", name: "Demo: Item F", category: "Demo products", kind: "PRODUCT", basePrice: 40, approvedForSale: true, popular: true, priceStatus: "UNVERIFIED", description: "Demo product with an unverified recipe and batch crafting." },
  { key: "G", name: "Demo: Item G", category: "Demo products", kind: "PRODUCT", description: "Demo product with no recipe yet." },
];

const RECIPES: { item: string; name: string; isPrimary: boolean; outputQty: number; craftSeconds: number | null; verified: boolean; station?: string; ings: Record<string, number> }[] = [
  { item: "B", name: "Primary", isPrimary: true, outputQty: 1, craftSeconds: 10, verified: true, station: "Demo Workbench", ings: { D: 4 } },
  { item: "A", name: "Primary", isPrimary: true, outputQty: 1, craftSeconds: 30, verified: true, station: "Demo Workbench", ings: { B: 3, C: 2 } },
  { item: "E", name: "Primary", isPrimary: true, outputQty: 4, craftSeconds: 20, verified: true, station: "Demo Furnace", ings: { D: 3 } },
  { item: "E", name: "Alternative (from C)", isPrimary: false, outputQty: 4, craftSeconds: 15, verified: false, station: "Demo Furnace", ings: { C: 2 } },
  { item: "F", name: "Primary", isPrimary: true, outputQty: 1, craftSeconds: null, verified: false, ings: { E: 2, B: 1 } },
];

async function main() {
  const existing = await prisma.item.count({ where: { isDemo: true } });
  if (existing) {
    console.log(`Demo data already loaded (${existing} items). Delete it in Admin → Settings first to reload.`);
    return;
  }
  const ids: Record<string, string> = {};
  for (const { key, ...d } of ITEMS) {
    const slug = `demo-${key.toLowerCase()}`;
    const it = await prisma.item.create({
      data: { ...d, slug, isDemo: true, tiers: d.kind !== "RAW" ? { create: TIERS } : undefined },
    });
    ids[key] = it.id;
    if (d.onHand) await prisma.inventoryAdjustment.create({ data: { itemId: it.id, delta: d.onHand, reason: "Demo starting stock" } });
  }
  for (const r of RECIPES) {
    await prisma.recipe.create({
      data: {
        itemId: ids[r.item],
        name: r.name,
        isPrimary: r.isPrimary,
        outputQty: r.outputQty,
        craftSeconds: r.craftSeconds,
        station: r.station ?? null,
        status: r.verified ? "VERIFIED" : "UNVERIFIED",
        notes: "Demo recipe, not real game data.",
        ingredients: { create: Object.entries(r.ings).map(([k, quantity]) => ({ itemId: ids[k], quantity })) },
      },
    });
  }
  console.log(`Demo data loaded: ${ITEMS.length} items, ${RECIPES.length} recipes. All names start with "Demo:".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
