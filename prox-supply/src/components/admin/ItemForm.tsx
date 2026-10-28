import type { Item } from "@prisma/client";
import { ApproveToggle } from "./ApproveToggle";

const F = ({ label, children, hint, className = "" }: { label: string; children: React.ReactNode; hint?: string; className?: string }) => (
  <div className={className}>
    <label className="label">{label}</label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-fog-500">{hint}</p>}
  </div>
);

export function ItemFields({ item, warnings = [], defaults }: { item?: Partial<Item>; warnings?: string[]; defaults: { minMarginPct: number; quoteThreshold: number | null } }) {
  const v = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  return (
    <div className="space-y-6">
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="h3 mb-2">Basics</legend>
        <F label="Name *" className="sm:col-span-2"><input name="name" required maxLength={120} className="input" defaultValue={item?.name ?? ""} /></F>
        <F label="Category"><input name="category" maxLength={60} className="input" defaultValue={item?.category ?? ""} placeholder="e.g. Mining" /></F>
        <F label="Type">
          <select name="kind" className="input" defaultValue={item?.kind ?? "RAW"}>
            <option value="RAW">Raw material</option>
            <option value="INTERMEDIATE">Intermediate (crafted component)</option>
            <option value="PRODUCT">Finished product</option>
          </select>
        </F>
        <F label="Description" className="sm:col-span-2 lg:col-span-4"><textarea name="description" rows={2} maxLength={2000} className="input" defaultValue={item?.description ?? ""} /></F>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="h3 mb-2">Sourcing & costs (in-game $ per unit)</legend>
        <F label="Acquisition" hint="How you get it when not crafting">
          <select name="acquisition" className="input" defaultValue={item?.acquisition ?? "PURCHASE"}>
            <option value="PURCHASE">Purchased</option>
            <option value="GATHER">Gathered (mine/farm/fish)</option>
            <option value="STOCK">From stock only</option>
          </select>
        </F>
        <F label="Craft or buy" hint="Auto picks the cheaper route">
          <select name="sourcePreference" className="input" defaultValue={item?.sourcePreference ?? "AUTO"}>
            <option value="AUTO">Auto (cheapest)</option>
            <option value="CRAFT">Always craft</option>
            <option value="BUY">Always buy / gather</option>
          </select>
        </F>
        <F label="Buy price"><input name="buyPrice" inputMode="numeric" className="input" defaultValue={v(item?.buyPrice)} placeholder="Unknown" /></F>
        <F label="Gather cost" hint="Your cost per unit, often 0"><input name="gatherCost" inputMode="numeric" className="input" defaultValue={v(item?.gatherCost)} placeholder="Unknown" /></F>
        <F label="Market value" hint="Replacement value"><input name="marketValue" inputMode="numeric" className="input" defaultValue={v(item?.marketValue)} placeholder="Unknown" /></F>
        <F label="Sell price" hint="What you could sell it for"><input name="sellPrice" inputMode="numeric" className="input" defaultValue={v(item?.sellPrice)} placeholder="Unknown" /></F>
        <F label="Extra cost per unit" hint="Other production expenses"><input name="extraCostPerUnit" inputMode="numeric" className="input" defaultValue={v(item?.extraCostPerUnit ?? 0)} /></F>
        <F label="Price data">
          <select name="priceStatus" className="input" defaultValue={item?.priceStatus ?? "UNVERIFIED"}>
            <option value="UNVERIFIED">Unverified</option>
            <option value="VERIFIED">Verified</option>
          </select>
        </F>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="h3 mb-2">Storefront</legend>
        <F label="Base selling price / unit"><input name="basePrice" inputMode="numeric" className="input" defaultValue={v(item?.basePrice)} placeholder="Not for sale" /></F>
        <F label="Minimum margin %" hint="Discounts never go below this"><input name="minMarginPct" inputMode="decimal" className="input" defaultValue={String(item?.minMarginPct ?? defaults.minMarginPct)} /></F>
        <F label="Custom-quote threshold" hint={`Blank = default (${defaults.quoteThreshold ?? "none"})`}><input name="quoteThreshold" inputMode="numeric" className="input" defaultValue={v(item?.quoteThreshold)} /></F>
        <F label="Low-stock threshold"><input name="lowStockThreshold" inputMode="numeric" className="input" defaultValue={v(item?.lowStockThreshold)} placeholder="No alert" /></F>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 sm:col-span-2 lg:col-span-4">
          <div className="min-w-[16rem] flex-1"><ApproveToggle defaultChecked={item?.approvedForSale ?? false} warnings={warnings} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" className="check" defaultChecked={item?.featured ?? false} /> Featured</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="popular" className="check" defaultChecked={item?.popular ?? false} /> Popular</label>
        </div>
      </fieldset>
    </div>
  );
}
