import Link from "next/link";
import { profitabilityData } from "@/server/admin-data";
import { PageHeader, Empty } from "@/components/admin/Stat";
import { StatusBadge } from "@/components/StatusBadge";
import { duration, money, moneyUnit, num, pct } from "@/lib/format";
import type { OrderStatus } from "@/lib/orders";

export const metadata = { title: "Profitability" };

const SORTS = { unit: "Profit per unit", order: "Profit per order", hour: "Profit per production hour", margin: "Margin" } as const;

export default async function ProfitPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort: raw } = await searchParams;
  const sort = (raw && raw in SORTS ? raw : "unit") as keyof typeof SORTS;
  const { products, rankedOrders } = await profitabilityData();
  const key = { unit: "profitUnit", order: "profitPerOrder", hour: "profitPerHour", margin: "marginPct" } as const;
  const sorted = [...products].sort((a, b) => (b[key[sort]] ?? -Infinity) - (a[key[sort]] ?? -Infinity));
  return (
    <>
      <PageHeader title="Profitability" sub="Rankings use marginal unit costs at list price (before bulk discounts). Unknown values sink to the bottom." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Object.entries(SORTS).map(([k, label]) => (
          <Link key={k} href={`?sort=${k}`} className={`btn-sm rounded-full border ${sort === k ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 text-fog-400"}`}>{label}</Link>
        ))}
      </div>
      {sorted.length === 0 ? <Empty>No products yet.</Empty> : (
        <div className="table-wrap mb-8">
          <table className="table">
            <thead><tr><th>#</th><th>Product</th><th className="num">Price</th><th className="num">Unit cost</th><th className="num">Profit / unit</th><th className="num">Margin</th><th className="num">Time / unit</th><th className="num">Profit / hour</th><th className="num">Orders</th><th className="num">Avg qty</th><th className="num">Profit / order</th></tr></thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.item.id}>
                  <td className="text-fog-500">{i + 1}</td>
                  <td><Link href={`/admin/items/${p.item.id}`} className="hover:text-brand-300">{p.item.name}</Link>{!p.item.approvedForSale && <span className="badge-neutral ml-2">Hidden</span>}</td>
                  <td className="num">{money(p.item.basePrice)}</td>
                  <td className="num">{moneyUnit(p.unitCost)}</td>
                  <td className={`num font-medium ${p.profitUnit !== null && p.profitUnit < 0 ? "text-bad" : ""}`}>{moneyUnit(p.profitUnit)}</td>
                  <td className="num">{pct(p.marginPct)}</td>
                  <td className="num">{p.secsPerUnit === null ? "—" : duration(p.secsPerUnit)}</td>
                  <td className="num">{money(p.profitPerHour)}</td>
                  <td className="num">{num(p.orderCount)}</td>
                  <td className="num">{p.avgQty === null ? "—" : num(Math.round(p.avgQty))}</td>
                  <td className="num">{money(p.profitPerOrder)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="h3 mb-2">Most profitable orders</h2>
      {rankedOrders.length === 0 ? <Empty>No orders with a known cost yet.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th className="num">Revenue</th><th className="num">Cost</th><th className="num">Profit</th><th className="num">Margin</th></tr></thead>
            <tbody>
              {rankedOrders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/orders/${o.id}`} className="font-mono text-brand-300">{o.number}</Link></td>
                  <td>{o.ign}</td>
                  <td><StatusBadge status={o.status as OrderStatus} /></td>
                  <td className="num">{money(o.total)}</td>
                  <td className="num">{money(o.estCost)}</td>
                  <td className={`num ${o.profit < 0 ? "text-bad" : "text-ok"}`}>{money(o.profit)}</td>
                  <td className="num">{o.total ? pct((o.profit / o.total) * 100) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
