import Link from "next/link";
import { prisma } from "@/server/db";
import { productionPlan } from "@/server/admin-data";
import { PageHeader, Empty, Stat } from "@/components/admin/Stat";
import { CraftingSteps, PlanSummary, RequirementsTable, ShoppingList } from "@/components/admin/PlanView";
import { StatusBadge } from "@/components/StatusBadge";
import { PRODUCTION_STATUSES, type OrderStatus } from "@/lib/orders";
import { duration, money, num } from "@/lib/format";

export const metadata = { title: "Production queue" };

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ order?: string; customer?: string }> }) {
  const sp = await searchParams;
  const [all, { orders, plan, error, stock }] = await Promise.all([
    prisma.order.findMany({ where: { status: { in: PRODUCTION_STATUSES } }, select: { id: true, number: true, ign: true }, orderBy: { createdAt: "asc" } }),
    productionPlan({ orderId: sp.order || undefined, customer: sp.customer?.trim() || undefined }),
  ]);
  const surplus = plan?.nodes.filter((n) => n.surplus > 0) ?? [];
  return (
    <>
      <PageHeader title="Production queue" sub="All accepted orders that aren't ready yet, combined into one plan. Shared ingredients are pooled before batches are rounded." />
      <form className="mb-5 flex flex-wrap gap-2">
        <select name="order" defaultValue={sp.order ?? ""} className="input w-56">
          <option value="">All orders ({all.length})</option>
          {all.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.ign}</option>)}
        </select>
        <input name="customer" defaultValue={sp.customer} placeholder="Customer IGN or Discord" className="input w-56" />
        <button className="btn-secondary">Filter</button>
        {(sp.order || sp.customer) && <Link href="/admin/production" className="btn-ghost">Clear</Link>}
      </form>

      {orders.length === 0 ? <Empty>No accepted orders waiting for production.</Empty> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Orders in plan" value={num(orders.length)} />
            <Stat label="Units ordered" value={num(orders.reduce((a, o) => a + o.lines.reduce((b, l) => b + l.quantity, 0), 0))} />
            <Stat label="Material spend" value={money(plan?.cost.materials)} />
            <Stat label="Est. crafting time" value={plan ? duration(plan.craftSeconds) : "—"} sub={plan?.unknownTimes.length ? `+ unknown for ${plan.unknownTimes.length} item(s)` : undefined} />
          </div>
          <div className="flex flex-wrap gap-2">
            {orders.map((o) => (
              <Link key={o.id} href={`/admin/orders/${o.id}`} className="card flex items-center gap-2 px-3 py-2 text-sm hover:border-ink-500">
                <span className="font-mono">{o.number}</span><span className="text-fog-400">{o.ign}</span><StatusBadge status={o.status as OrderStatus} />
              </Link>
            ))}
          </div>
          {error && <p className="notice-bad">{error}</p>}
          {plan && (
            <>
              <PlanSummary plan={plan} />
              <section><h2 className="h3 mb-2">Everything required</h2><RequirementsTable plan={plan} stock={stock} /></section>
              <div className="grid gap-6 xl:grid-cols-2">
                <section><h2 className="h3 mb-2">Left to gather or buy</h2><ShoppingList plan={plan} /></section>
                <section>
                  <h2 className="h3 mb-2">Surplus from batch rounding</h2>
                  {surplus.length === 0 ? <p className="text-sm text-fog-500">No surplus: every batch is used exactly.</p> : (
                    <div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th className="num">Produced</th><th className="num">Needed</th><th className="num">Surplus</th></tr></thead>
                      <tbody>{surplus.map((n) => <tr key={n.itemId}><td>{n.name}</td><td className="num">{num(n.produced)}</td><td className="num">{num(n.net)}</td><td className="num text-info">+{num(n.surplus)}</td></tr>)}</tbody></table></div>
                  )}
                  <p className="mt-2 text-xs text-fog-500">Surplus isn&apos;t added to inventory automatically. Record it on the Inventory page once crafted.</p>
                </section>
              </div>
              <section><h2 className="h3 mb-2">Crafting steps (lowest stage first)</h2><CraftingSteps plan={plan} /></section>
            </>
          )}
        </div>
      )}
    </>
  );
}
