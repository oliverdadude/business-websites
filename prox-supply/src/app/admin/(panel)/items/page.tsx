import Link from "next/link";
import { getSettings } from "@/server/settings";
import { buildCatalog, loadItems, marginalUnitCost, needsRecipe } from "@/server/catalog";
import { quickUpdateItemAction } from "@/server/admin-actions";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { PageHeader, Empty } from "@/components/admin/Stat";
import { moneyUnit } from "@/lib/format";

export const metadata = { title: "Items & recipes" };

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; deleted?: string }> }) {
  const sp = await searchParams;
  const [items, s] = await Promise.all([loadItems(), getSettings()]);
  const catalog = buildCatalog(items);
  const q = sp.q?.trim().toLowerCase();
  const shown = items.filter((i) => (!sp.kind || i.kind === sp.kind) && (!q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)));
  const v = (n: number | null) => (n === null ? "" : String(n));
  return (
    <>
      <PageHeader
        title="Items & recipes"
        sub="Materials, intermediates and products. Edit prices inline, or open an item for recipes, tiers and its crafting tree."
        actions={<Link href="/admin/items/new" className="btn-primary">+ New item</Link>}
      />
      {sp.deleted && <p className="notice-ok mb-4">Item deleted.</p>}
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search name or category" className="input w-60" />
        <select name="kind" defaultValue={sp.kind ?? ""} className="input w-48">
          <option value="">All types</option><option value="RAW">Raw materials</option><option value="INTERMEDIATE">Intermediates</option><option value="PRODUCT">Products</option>
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      {shown.length === 0 ? <Empty>No items yet. Run <code>npm run db:seed</code> or add one.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th><th>Recipe</th><th className="num">Unit cost</th>
                <th>Buy · Gather · Market · Sell · <span className="text-brand-300">Sell price</span> · Status</th>
                <th>Store</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const verified = i.recipes.filter((r) => r.status === "VERIFIED").length;
                return (
                  <tr key={i.id}>
                    <td className="min-w-[12rem]">
                      <Link href={`/admin/items/${i.id}`} className="font-medium hover:text-brand-300">{i.name}</Link>
                      <p className="text-xs text-fog-500">{i.kind.toLowerCase()} · {i.category}{i.isDemo && <span className="badge-info ml-1.5">Demo</span>}</p>
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {needsRecipe(i) ? <span className="badge-warn">Unverified — Recipe Required</span>
                        : i.recipes.length === 0 ? <span className="text-fog-500">—</span>
                        : <span className={verified === i.recipes.length ? "badge-ok" : "badge-warn"}>{i.recipes.length} recipe{i.recipes.length > 1 ? "s" : ""} · {verified === i.recipes.length ? "verified" : "unverified"}</span>}
                    </td>
                    <td className="num text-fog-300">{moneyUnit(marginalUnitCost(catalog, s, i.id))}</td>
                    <td className="min-w-[34rem]">
                      <ActionForm action={quickUpdateItemAction.bind(null, i.id)} className="flex flex-wrap items-center gap-1.5" inlineMessage>
                        {(["buyPrice", "gatherCost", "marketValue", "sellPrice"] as const).map((f) => (
                          <input key={f} name={f} defaultValue={v(i[f])} placeholder="—" inputMode="numeric" aria-label={f} className="input-sm w-[4.5rem] tabular-nums" />
                        ))}
                        <input name="basePrice" defaultValue={v(i.basePrice)} placeholder="—" inputMode="numeric" aria-label="Base selling price" className="input-sm w-20 border-brand-700/60 tabular-nums" />
                        <select name="priceStatus" defaultValue={i.priceStatus} className="input-sm w-[6.5rem]" aria-label="Price status">
                          <option value="UNVERIFIED">Unverified</option><option value="VERIFIED">Verified</option>
                        </select>
                        <Submit className="btn-secondary btn-sm">Save</Submit>
                      </ActionForm>
                    </td>
                    <td className="whitespace-nowrap">
                      {i.approvedForSale ? <span className="badge-ok">On sale</span> : <span className="badge-neutral">Hidden</span>}
                      {i.featured && <span className="badge-info ml-1">F</span>}
                      {i.popular && <span className="badge-brand ml-1">P</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
