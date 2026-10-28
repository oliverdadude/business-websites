import "server-only";
import { prisma } from "./db";
import type { PublicItem } from "@/components/store/types";
import { getSettings } from "./settings";

export async function getPublicItems(): Promise<PublicItem[]> {
  const [rows, s] = await Promise.all([
    prisma.item.findMany({
      where: { approvedForSale: true, basePrice: { gt: 0 } },
      include: { tiers: { orderBy: { minQty: "asc" } } },
      orderBy: [{ popular: "desc" }, { name: "asc" }],
    }),
    getSettings(),
  ]);
  return rows.map((i) => ({
    id: i.id,
    slug: i.slug,
    name: i.name,
    category: i.category,
    description: i.description,
    basePrice: i.basePrice!,
    tiers: i.tiers.map((t) => ({ minQty: t.minQty, pct: t.pct })),
    quoteThreshold: i.quoteThreshold ?? s.defaultQuoteThreshold,
    featured: i.featured,
    popular: i.popular,
  }));
}
