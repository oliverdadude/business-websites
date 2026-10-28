import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings } from "@/server/settings";
import { buildCatalog, lineCost, loadItems, needsRecipe, unverifiedReasons, valuation } from "@/server/catalog";
import { reservedTotals } from "@/server/catalog";
import {
  deleteItemAction, deleteRecipeAction, makePrimaryRecipeAction, saveRecipeAction, saveTiersAction, updateItemAction,
} from "@/server/admin-actions";
import { ActionButton, ActionForm, Submit } from "@/components/admin/ActionForm";
import { ItemFields } from "@/components/admin/ItemForm";
import { RecipeEditor } from "@/components/admin/RecipeEditor";
import { TiersEditor } from "@/components/admin/TiersEditor";
import { CraftTree } from "@/components/admin/CraftTree";
import { VerifiedBadge } from "@/components/StatusBadge";
import { buildTree, createChooser, priceLine, profitMetrics, type TreeNode } from "@/lib/engine";
import { duration, money, moneyUnit, num, pct } from "@/lib/format";
import { unitCraftSeconds } from "@/lib/engine";

export const metadata = { title: "Item" };

function collect(t: TreeNode, out = new Set<string>()) {
  out.add(t.itemId);
  t.children.forEach((c) => collect(c, out));
  return out;
}

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qty?: string; created?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [items, s, reserved] = await Promise.all([loadItems(), getSettings(), reservedTotals()]);
  const item = items.find((i) => i.id === id);
  if (!item) notFound();
  const catalog = buildCatalog(items);
  const qty = Math.min(1_000_000, Math.max(1, Math.floor(Number(sp.qty) || 100)));
  const warnings = unverifiedReasons(catalog, s, item);
  const options = items.filter((i) => i.id !== id).map((i) => ({ id: i.id, name: i.name, kind: i.kind }));
  const nameOf = new Map(items.map((i) => [i.id, i.name]));
  const usedIn = items.filter((i) => i.recipes.some((r) => r.ingredients.some((g) => g.itemId === id)));

  let tree: TreeNode | null = null;
  let treeError: string | null = null;
  try {
    tree = buildTree(catalog, id, qty, valuation(s));
  } catch (e) {
    treeError = e instanceof Error ? e.message : "Could not build tree";
  }
  let choose: ReturnType<typeof createChooser> | null = null;
  try {
    choose = createChooser(catalog, valuation(s));
    choose(id);
  } catch {
    choose = null;
  }
  const comparisonIds = tree ? [...collect(tree)].filter((x) => (catalog.get(x)?.recipes.length ?? 0) > 0) : [];

  const cost = lineCost(catalog, s, id, qty);
  const price = item.basePrice !== null
    ? priceLine({ basePrice: item.basePrice, tiers: item.tiers, minMarginPct: item.minMarginPct, quoteThreshold: item.quoteThreshold ?? s.defaultQuoteThreshold }, qty, cost)
    : null;
  const metrics = price && cost !== null ? profitMetrics(price.lineTotal, cost, qty) : null;
  let secs: number | null = null;
  try { secs = unitCraftSeconds(catalog, id, valuation(s)); } catch { secs = null; }

  return (
    <>
      <Link href="/admin/items" className="text-xs text-fog-400 hover:text-fog-100">← Items</Link>
      <div className="mb-6 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {item.name}
            {needsRecipe(item) && <span className="badge-warn">Unverified — Recipe Required</span>}
            {item.approvedForSale ? <span className="badge-ok">On sale</span> : <span className="badge-neutral">Not on sale</span>}
            {item.isDemo && <span className="badge-info">Demo</span>}
          </h1>
          <p className="mt-1 text-sm text-fog-400">{item.kind.toLowerCase()} · {item.category} · on hand {num(item.onHand)} · reserved {num(reserved[id] ?? 0)}</p>
        </div>
        <ActionButton action={deleteItemAction.bind(null, id)} className="btn-danger btn-sm" confirm={`Delete ${item.name}? This can't be undone.`}>Delete item</ActionButton>
      </div>
      {sp.created && <p className="notice-ok mb-4">Item created. Add recipes and check the discount tiers below.</p>}

      <div className="grid gap-6 2xl:grid-cols-[1fr_28rem]">
        <div className="min-w-0 space-y-6">
          <section className="card card-pad">
            <h2 className="h2 mb-4">Details & prices</h2>
            <ActionForm action={updateItemAction.bind(null, id)} className="space-y-6">
              <ItemFields item={item} warnings={warnings} defaults={{ minMarginPct: s.defaultMinMarginPct, quoteThreshold: s.defaultQuoteThreshold }} />
              <Submit>Save item</Submit>
            </ActionForm>
          </section>

          <section className="card card-pad">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="h2">Recipes</h2>
              <span className="text-xs text-fog-500">Several recipes = alternatives. The planner uses the cheapest unless you force one.</span>
            </div>
            {item.recipes.length === 0 && (
              <p className="notice-warn mb-4">{item.kind === "RAW" ? "Raw materials usually have no recipe." : "Unverified — Recipe Required. Add the recipe once you've confirmed it in-game."}</p>
            )}
            <div className="space-y-4">
              {item.recipes.map((r) => (
                <details key={r.id} className="rounded-lg border border-ink-700 bg-ink-850/50">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm">
                    <span className="font-medium">{r.name}</span>
                    {r.isPrimary && <span className="badge-brand">Primary</span>}
                    <VerifiedBadge verified={r.status === "VERIFIED"} />
                    <span className="text-fog-400">
                      → {num(r.outputQty)} per craft · {r.ingredients.map((g) => `${num(g.quantity)} ${nameOf.get(g.itemId)}`).join(", ")}
                    </span>
                    {choose && <span className="ml-auto text-xs tabular-nums text-fog-400">{moneyUnit(choose(id).recipeUnitCosts[r.id])}/unit</span>}
                  </summary>
                  <div className="border-t border-ink-700 p-4">
                    <RecipeEditor action={saveRecipeAction.bind(null, id, r.id)} options={options} initial={{ ...r, ingredients: r.ingredients }} />
                    <div className="mt-3 flex gap-2">
                      {!r.isPrimary && <ActionButton action={makePrimaryRecipeAction.bind(null, r.id)} className="btn-secondary btn-sm">Make primary</ActionButton>}
                      <ActionButton action={deleteRecipeAction.bind(null, r.id)} className="btn-danger btn-sm" confirm="Delete this recipe?">Delete recipe</ActionButton>
                    </div>
                  </div>
                </details>
              ))}
              <details className="rounded-lg border border-dashed border-ink-600" open={item.recipes.length === 0 && item.kind !== "RAW"}>
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-brand-300">+ Add {item.recipes.length ? "alternative " : ""}recipe</summary>
                <div className="border-t border-ink-700 p-4">
                  <RecipeEditor action={saveRecipeAction.bind(null, id, null)} options={options} initial={item.recipes.length ? { name: `Alternative ${item.recipes.length}`, isPrimary: false, outputQty: 1, craftSeconds: null, station: null, skill: null, skillLevel: null, extraCostPerBatch: 0, status: "UNVERIFIED", notes: "", ingredients: [{ itemId: "", quantity: 1 }] } : undefined} submitLabel="Add recipe" />
                </div>
              </details>
            </div>
            {usedIn.length > 0 && (
              <p className="mt-4 text-sm text-fog-400">Used in: {usedIn.map((u, i) => <span key={u.id}>{i > 0 && ", "}<Link href={`/admin/items/${u.id}`} className="text-fog-200 hover:text-brand-300">{u.name}</Link></span>)}</p>
            )}
          </section>

          {item.kind !== "RAW" && (
            <section className="card card-pad">
              <h2 className="h2 mb-1">Discount tiers</h2>
              <p className="mb-4 text-sm text-fog-400">Per-product. Discounts are capped so profit never falls below the {pct(item.minMarginPct)} minimum margin, and withheld while cost is unknown.</p>
              <ActionForm action={saveTiersAction.bind(null, id)} className="space-y-3">
                <TiersEditor initial={item.tiers} />
                <div className="flex gap-2"><Submit>Save tiers</Submit></div>
              </ActionForm>
              <ActionForm action={saveTiersAction.bind(null, id)} className="mt-2" confirm="Replace these tiers with the default tiers from Settings?">
                <input type="hidden" name="reset" value="1" />
                <Submit className="btn-ghost btn-sm">Reset to defaults</Submit>
              </ActionForm>
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <section className="card card-pad">
            <form className="mb-4 flex items-end gap-2">
              <div className="flex-1"><label className="label">Quantity to analyse</label><input name="qty" defaultValue={qty} inputMode="numeric" className="input tabular-nums" /></div>
              <button className="btn-secondary">Update</button>
            </form>
            <h2 className="h3 mb-3">Cost & profit at {num(qty)}</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-fog-400">Production cost</dt><dd className="tabular-nums">{money(cost)}</dd></div>
              <div className="flex justify-between"><dt className="text-fog-400">Cost per unit (break-even)</dt><dd className="tabular-nums">{moneyUnit(cost === null ? null : cost / qty)}</dd></div>
              {price ? (
                <>
                  <div className="flex justify-between"><dt className="text-fog-400">List subtotal</dt><dd className="tabular-nums">{money(price.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-fog-400">Tier discount offered / applied</dt><dd className="tabular-nums">{pct(price.tierPct)} / {pct(price.appliedPct)}</dd></div>
                  <div className="flex justify-between font-semibold"><dt>Customer pays</dt><dd className="tabular-nums">{money(price.lineTotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-fog-400">Profit</dt><dd className={`tabular-nums ${metrics && metrics.profit < 0 ? "text-bad" : "text-ok"}`}>{money(metrics?.profit)}</dd></div>
                  <div className="flex justify-between"><dt className="text-fog-400">Margin · Markup</dt><dd className="tabular-nums">{pct(metrics?.marginPct)} · {pct(metrics?.markupPct)}</dd></div>
                  <div className="flex justify-between"><dt className="text-fog-400">Lowest total for min. margin</dt><dd className="tabular-nums">{money(price.floorTotal)}</dd></div>
                  {price.cappedByMargin && <p className="notice-warn mt-2 text-xs">Tier discount reduced to protect the minimum margin.</p>}
                  {price.belowMinMargin && <p className="notice-bad mt-2 text-xs">Even the base price is below the minimum margin. Raise the price.</p>}
                  {price.costUnknown && <p className="notice-warn mt-2 text-xs">Cost unknown: customers get no discount until every material is priced.</p>}
                  {price.quoteRequired && <p className="notice-info mt-2 text-xs">This quantity needs a custom quote.</p>}
                </>
              ) : <p className="text-fog-500">No selling price set.</p>}
              <div className="flex justify-between border-t border-ink-700 pt-2"><dt className="text-fog-400">Craft time per unit</dt><dd className="tabular-nums">{duration(secs)}</dd></div>
            </dl>
          </section>

          <section className="card card-pad">
            <h2 className="h3 mb-3">Crafting tree for {num(qty)}</h2>
            {treeError ? <p className="notice-bad">{treeError}</p> : tree && <CraftTree tree={tree} />}
            <p className="mt-3 text-xs text-fog-500">Rounded per branch, without stock. The order planner pools shared ingredients across branches first.</p>
          </section>

          {choose && comparisonIds.length > 0 && (
            <section className="card card-pad">
              <h2 className="h3 mb-3">Craft vs buy</h2>
              <div className="space-y-3">
                {comparisonIds.map((cid) => {
                  const it = catalog.get(cid)!;
                  const c = choose!(cid);
                  return (
                    <div key={cid} className="rounded-lg border border-ink-700 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{it.name}</span>
                        <span className={c.mode === "craft" ? "badge-brand" : "badge-info"}>{c.mode === "craft" ? `Craft (${c.recipe?.name})` : "Buy / gather"}</span>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs">
                        {it.recipes.map((r) => (
                          <li key={r.id} className="flex justify-between"><span className="text-fog-400">Craft · {r.name}</span><span className="tabular-nums">{r.id in c.recipeUnitCosts ? moneyUnit(c.recipeUnitCosts[r.id]) : "not considered"}</span></li>
                        ))}
                        <li className="flex justify-between"><span className="text-fog-400">Acquire ({it.acquisition.toLowerCase()})</span><span className="tabular-nums">{moneyUnit(c.acquireUnitCost)}</span></li>
                      </ul>
                      {it.sourcePreference !== "AUTO" && <p className="mt-1 text-[11px] text-fog-500">Preference forced: {it.sourcePreference.toLowerCase()}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
