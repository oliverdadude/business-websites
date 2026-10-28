import { getSettings } from "@/server/settings";
import { getPublicItems } from "@/server/storefront";
import { CatalogBrowser } from "@/components/store/CatalogBrowser";

export const metadata = { title: "Catalogue" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [s, items, sp] = await Promise.all([getSettings(), getPublicItems(), searchParams]);
  return (
    <div className="container-x py-10">
      <div className="mb-6">
        <h1 className="h1">Catalogue</h1>
        <p className="mt-2 text-fog-400">Prices are per unit in Proximity RP dollars. Type any quantity to see your bulk price.</p>
      </div>
      <CatalogBrowser items={items} ordersOpen={s.ordersOpen} initialCategory={sp.category} />
    </div>
  );
}
