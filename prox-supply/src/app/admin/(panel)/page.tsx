import Link from "next/link";
import { dashboardData } from "@/server/admin-data";
import { prisma } from "@/server/db";
import { PageHeader, Stat } from "@/components/admin/Stat";
import { dateTime, duration, money, num } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const [d, recent] = await Promise.all([
    dashboardData(),
    prisma.order.findMany({ where: { status: "PENDING_APPROVAL" }, orderBy: { createdAt: "asc" }, take: 8 }),
  ]);
  return (
    <>
      <PageHeader title="Dashboard" sub="Inventory is managed here and is not synced with the game." actions={<Link href="/admin/orders" className="btn-secondary">All orders</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending approval" value={num(d.pending)} tone={d.pending ? "warn" : undefined} sub="Waiting for you" />
        <Stat label="In production" value={num(d.inProduction)} sub={`${d.crafting} crafting now`} tone="brand" />
        <Stat label="Ready to deliver" value={num(d.readyCount)} tone={d.readyCount ? "ok" : undefined} />
        <Stat label="Completed orders" value={num(d.completedCount)} />
        <Stat label="Total revenue" value={money(d.revenue)} sub="Completed orders" />
        <Stat label="Estimated profit" value={money(d.profit.profit)} tone={d.profit.profit >= 0 ? "ok" : "bad"} sub={d.profit.unknown ? `${d.profit.unknown} order(s) without a known cost excluded` : "Completed orders"} />
        <Stat label="Pipeline" value={money(d.pipelineValue)} sub={`Est. profit ${money(d.pipelineProfit.profit)}${d.pipelineProfit.unknown ? ` (+${d.pipelineProfit.unknown} unknown)` : ""}`} />
        <Stat label="Inventory value" value={money(d.invValue)} sub={d.unvalued ? `${d.unvalued} item(s) have no value set` : "At market / replacement value"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="font-semibold">Pending orders</h2>
            <Link href="/admin/orders?status=PENDING_APPROVAL" className="text-xs text-brand-400">View all</Link>
          </div>
          {recent.length === 0 ? <p className="p-4 text-sm text-fog-500">Nothing waiting.</p> : (
            <ul className="divide-y divide-ink-800">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-850">
                    <div><p className="font-mono text-sm">{o.number}</p><p className="text-xs text-fog-500">{o.ign} · {dateTime(o.createdAt)}</p></div>
                    <div className="text-right"><p className="tabular-nums">{money(o.total)}</p>{o.quoteRequested && <span className="badge-info">Quote</span>}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="font-semibold">Ready to deliver</h2>
          </div>
          {d.ready.length === 0 ? <p className="p-4 text-sm text-fog-500">Nothing ready yet.</p> : (
            <ul className="divide-y divide-ink-800">
              {d.ready.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-ink-850">
                    <div><p className="font-mono text-sm">{o.number}</p><p className="text-xs text-fog-500">{o.ign}</p></div>
                    <div className="flex items-center gap-2"><span className="tabular-nums">{money(o.total)}</span>{o.paymentReceived ? <span className="badge-ok">Paid</span> : <span className="badge-neutral">Unpaid</span>}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="font-semibold">Outstanding materials</h2>
            <Link href="/admin/production" className="text-xs text-brand-400">Production queue · {duration(d.craftSeconds)}</Link>
          </div>
          {d.prodError && <p className="notice-bad m-4">{d.prodError}</p>}
          {d.shopping.length === 0 ? <p className="p-4 text-sm text-fog-500">No materials needed for accepted orders.</p> : (
            <table className="table">
              <thead><tr><th>Material</th><th>How</th><th className="num">Still needed</th><th className="num">Cost</th></tr></thead>
              <tbody>
                {d.shopping.slice(0, 10).map((n) => (
                  <tr key={n.itemId}>
                    <td>{n.name}</td>
                    <td className="text-xs text-fog-400">{n.acquisition === "GATHER" ? "Gather" : n.acquisition === "STOCK" ? <span className="text-bad">Stock short</span> : "Buy"}</td>
                    <td className="num">{num(n.toAcquire + n.shortfall)}</td>
                    <td className="num">{money(n.acquireCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="font-semibold">Low-stock alerts</h2>
            <Link href="/admin/inventory" className="text-xs text-brand-400">Inventory</Link>
          </div>
          {d.low.length === 0 ? <p className="p-4 text-sm text-fog-500">No low-stock alerts. Set thresholds on items to get alerts.</p> : (
            <table className="table">
              <thead><tr><th>Item</th><th className="num">Available</th><th className="num">Threshold</th></tr></thead>
              <tbody>
                {d.low.map((r) => (
                  <tr key={r.itemId}><td>{r.name}</td><td className="num text-warn">{num(r.available)}</td><td className="num">{num(r.threshold)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

