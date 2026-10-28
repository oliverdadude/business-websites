// Seeds ONLY the raw resources known to exist on Proximity RP. No prices, no recipes:
// everything is marked UNVERIFIED until you confirm it in-game.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RESOURCES = [
  { name: "Coal", category: "Mining" },
  { name: "Iron", category: "Mining" },
  { name: "Gold", category: "Mining" },
  { name: "Crops", category: "Farming" },
  { name: "Fish", category: "Fishing" },
  { name: "Crab", category: "Fishing" },
];

async function main() {
  let created = 0;
  for (const r of RESOURCES) {
    const exists = await prisma.item.findUnique({ where: { name: r.name } });
    if (exists) continue;
    await prisma.item.create({
      data: {
        name: r.name,
        slug: r.name.toLowerCase(),
        category: r.category,
        kind: "RAW",
        acquisition: "GATHER",
        priceStatus: "UNVERIFIED",
        description: `Raw ${r.category.toLowerCase()} resource. Prices not yet verified.`,
      },
    });
    created++;
  }
  console.log(`Seed complete: ${created} raw resource(s) created, ${RESOURCES.length - created} already existed. No prices were set.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
