import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { PageHeader, Empty } from "@/components/admin/Stat";
import { StatusBadge } from "@/components/StatusBadge";
import { ORDER_STATUSES, STATUS_LABEL, type OrderStatus } from "@/lib/orders";
import { dateTime, money, num } from "@/lib/format";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; paid?: string }> }) {
  const sp = await searchParams;
  const status = ORDER_STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const q = sp.q?.trim().slice(0, 60);
  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : sp.status === "open" ? { status: { notIn: ["COMPLETED", "CANCELLED"] } } : {}),
    ...(sp.paid === "yes" ? { paymentReceived: true } : sp.paid === "no" ? { paymentReceived: false } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { ign: { contains: q, mode: "insensitive" } }, { discord: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({ where, include: { lines: { select: { quantity: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const tab = (s: string | undefined, label: string, n?: number) => {
    const active = (sp.status ?? "") === (s ?? "");
    const params = new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) });
    return (
      <Link key={label} href={`/admin/orders${params.size ? `?${params}` : ""}`} className={`btn-sm rounded-full border ${active ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 text-fog-400 hover:text-fog-100"}`}>
        {label}{n !== undefined && <span className="ml-1 opacity-70">{n}</span>}
      </Link>
    );
  };
  return (
    <>
      <PageHeader title="Orders" sub="Approve, track and deliver customer orders." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {tab(undefined, "All")}
          {tab("open", "Open")}
          {ORDER_STATUSES.map((s) => tab(s, STATUS_LABEL[s], count[s] ?? 0))}
        </div>
        <form className="flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={q} placeholder="Order #, IGN or Discord" className="input w-56" />
          <select name="paid" defaultValue={sp.paid ?? ""} className="input w-32"><option value="">Any payment</option><option value="yes">Paid</option><option value="no">Unpaid</option></select>
          <button className="btn-secondary">Filter</button>
        </form>
      </div>
      {orders.length === 0 ? <Empty>No orders match.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Status</th><th className="num">Units</th><th className="num">Total</th><th className="num">Est. profit</th><th>Payment</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/orders/${o.id}`} className="font-mono text-brand-300 hover:underline">{o.number}</Link>{o.quoteRequested && <span className="badge-info ml-2">Quote</span>}</td>
                  <td><p>{o.ign}</p><p className="text-xs text-fog-500">{o.discord}</p></td>
                  <td className="whitespace-nowrap text-xs text-fog-400">{dateTime(o.createdAt)}</td>
                  <td><StatusBadge status={o.status as OrderStatus} /></td>
                  <td className="num">{num(o.lines.reduce((a, l) => a + l.quantity, 0))}</td>
                  <td className="num font-medium">{money(o.total)}</td>
                  <td className="num">{o.estCost === null ? <span className="text-fog-500">—</span> : <span className={o.total - o.estCost >= 0 ? "text-ok" : "text-bad"}>{money(o.total - o.estCost)}</span>}</td>
                  <td>{o.paymentReceived ? <span className="badge-ok">Paid</span> : <span className="badge-neutral">Unpaid</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
