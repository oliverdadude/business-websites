import { getSettings } from "@/server/settings";
import { prisma } from "@/server/db";
import { applyDefaultTiersToAllAction, deleteDemoDataAction, saveSettingsAction } from "@/server/admin-actions";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { TiersEditor } from "@/components/admin/TiersEditor";
import { PageHeader } from "@/components/admin/Stat";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [s, demoCount] = await Promise.all([getSettings(), prisma.item.count({ where: { isDemo: true } })]);
  return (
    <>
      <PageHeader title="Settings" />
      <ActionForm action={saveSettingsAction} className="space-y-6">
        <section className="card card-pad grid gap-4 sm:grid-cols-2">
          <h2 className="h3 sm:col-span-2">Business</h2>
          <div><label className="label">Business name</label><input name="businessName" className="input" defaultValue={s.businessName} maxLength={80} required /></div>
          <div><label className="label">Your Discord (shown to customers)</label><input name="sellerDiscord" className="input" defaultValue={s.sellerDiscord} maxLength={60} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="ordersOpen" className="check" defaultChecked={s.ordersOpen} /> Orders open (customers can check out)</label>
        </section>

        <section className="card card-pad grid gap-4 sm:grid-cols-2">
          <h2 className="h3 sm:col-span-2">Costing</h2>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="valueGatheredAtMarket" className="check mt-0.5" defaultChecked={s.valueGatheredAtMarket} />
            <span>Value gathered materials at market cost<span className="block text-xs text-fog-500">Off: use each item&apos;s gather cost (blank = $0). On: use market value, so your time has a price.</span></span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="valueStockAtMarket" className="check mt-0.5" defaultChecked={s.valueStockAtMarket} />
            <span>Value used stock at market<span className="block text-xs text-fog-500">On: stock consumed counts at market value (opportunity cost). Off: stock you already hold is free.</span></span></label>
          <div><label className="label">Extra cost per order</label><input name="extraCostPerOrder" inputMode="numeric" className="input" defaultValue={s.extraCostPerOrder} /></div>
        </section>

        <section className="card card-pad grid gap-4 sm:grid-cols-2">
          <h2 className="h3 sm:col-span-2">Pricing defaults</h2>
          <div><label className="label">Default minimum margin %</label><input name="defaultMinMarginPct" inputMode="decimal" className="input" defaultValue={s.defaultMinMarginPct} /></div>
          <div><label className="label">Default custom-quote threshold (units per line)</label><input name="defaultQuoteThreshold" inputMode="numeric" className="input" defaultValue={s.defaultQuoteThreshold ?? ""} placeholder="No threshold" /></div>
          <div className="sm:col-span-2">
            <p className="label">Default discount tiers</p>
            <p className="mb-3 text-xs text-fog-500">Copied to each new product. Placeholder values: change them to your real pricing.</p>
            <TiersEditor initial={s.defaultTiers} />
          </div>
        </section>
        <Submit>Save settings</Submit>
      </ActionForm>

      <section className="card card-pad mt-6">
        <h2 className="h3 mb-2">Bulk tier update</h2>
        <p className="mb-3 text-sm text-fog-400">Overwrite the discount tiers on every product and intermediate with the saved defaults.</p>
        <ActionForm action={applyDefaultTiersToAllAction} confirm="Replace the tiers on ALL products with the defaults?">
          <Submit className="btn-secondary">Apply default tiers to all products</Submit>
        </ActionForm>
      </section>

      <section id="demo" className="card card-pad mt-6 border-bad/30">
        <h2 className="h3 mb-2">Demo data</h2>
        <p className="mb-3 text-sm text-fog-400">
          {demoCount ? `${demoCount} demo items are loaded (names start with "Demo:").` : "No demo data loaded."} Deleting removes demo items, their recipes and any orders that contain them.
          Load demo data with <code className="text-fog-200">npm run db:seed:demo</code>.
        </p>
        <ActionForm action={deleteDemoDataAction} confirm="Delete all demo items and demo orders? This can't be undone.">
          <Submit className="btn-danger" pendingText="Deleting…">Delete demo data</Submit>
        </ActionForm>
      </section>
    </>
  );
}
