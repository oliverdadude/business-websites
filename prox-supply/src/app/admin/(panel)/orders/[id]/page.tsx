import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { buildCatalog, lineCost } from "@/server/catalog";
import { planForOrder } from "@/server/orders";
import { changeStatusAction, setQuotedTotalAction, updateOrderDetailsAction } from "@/server/admin-actions";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { CraftingSteps, PlanSummary, RequirementsTable, ShoppingList } from "@/components/admin/PlanView";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { profitMetrics } from "@/lib/engine";
import { allowedTransitions, STATUS_LABEL, type OrderStatus } from "@/lib/orders";
import { dateTime, money, moneyUnit, num, pct } from "@/lib/format";

export const metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { lines: true, events: { orderBy: { createdAt: "asc" } }, reservations: { include: { item: { select: { name: true } } } } },
  });
  if (!order) notFound();
  const status = order.status as OrderStatus;
  const [{ plan, error, items }, s] = await Promise.all([planForOrder({ ...order, status }), getSettings()]);
  const catalog = buildCatalog(items);
  const next = allowedTransitions(status);
  const closed = status === "COMPLETED" || status === "CANCELLED";

  const cost = plan && plan.cost.complete ? plan.cost.production + s.extraCostPerOrder : null;
  const shownCost = closed ? order.estCost : cost;
  const metrics = shownCost !== null ? profitMetrics(order.total, shownCost, order.lines.reduce((a, l) => a + l.quantity, 0)) : null;
  const lineEcon = order.lines.map((l) => {
    const c = catalog.has(l.itemId) ? lineCost(catalog, s, l.itemId, l.quantity) : null;
    return { ...l, cost: c, breakEven: c === null ? null : c / l.quantity, profit: c === null ? null : l.lineTotal - c };
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/orders" className="text-xs text-fog-400 hover:text-fog-100">← Orders</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold"><span className="font-mono">{order.number}</span> <StatusBadge status={status} /></h1>
          <p className="mt-1 text-sm text-fog-400">
            <span className="text-fog-100">{order.ign}</span> · Discord <span className="text-fog-100">{order.discord}</span> · placed {dateTime(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "PENDING_APPROVAL" && (
            <ActionForm action={changeStatusAction.bind(null, order.id)} inlineMessage>
              <input type="hidden" name="status" value="ACCEPTED" />
              <input type="hidden" name="note" value="Order accepted." />
              <Submit pendingText="Accepting…">Approve & reserve stock</Submit>
            </ActionForm>
          )}
          {next.includes("COMPLETED") && (
            <ActionForm action={changeStatusAction.bind(null, order.id)} confirm="Mark as delivered? Reserved stock will be deducted from inventory." inlineMessage>
              <input type="hidden" name="status" value="COMPLETED" />
              <input type="hidden" name="note" value="Delivered in-game. Thank you!" />
              <Submit className="btn-secondary" pendingText="Completing…">Mark delivered</Submit>
            </ActionForm>
          )}
        </div>
      </div>

      {order.quoteRequested && !closed && <p className="notice-info mb-4">Custom quote requested: confirm the final total below and tell the customer on Discord.</p>}
      {order.instructions && (
        <div className="card card-pad mb-6">
          <p className="h3 mb-1">Customer instructions</p>
          <p className="whitespace-pre-wrap text-sm">{order.instructions}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="h3 mb-2">Items</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Discount</th><th className="num">Line total</th><th className="num">Cost</th><th className="num">Break-even / unit</th><th className="num">Profit</th></tr></thead>
                <tbody>
                  {lineEcon.map((l) => (
                    <tr key={l.id}>
                      <td>{l.itemName}</td>
                      <td className="num">{num(l.quantity)}</td>
                      <td className="num">{money(l.unitPrice)}</td>
                      <td className="num">{l.discountPct ? `−${pct(l.discountPct)}` : "—"}</td>
                      <td className="num font-medium">{money(l.lineTotal)}</td>
                      <td className="num">{money(l.cost)}</td>
                      <td className="num">{moneyUnit(l.breakEven)}</td>
                      <td className={`num ${l.profit !== null && l.profit < 0 ? "text-bad" : ""}`}>{money(l.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-fog-500">Line costs are full replacement costs (no stock), so you can compare them with list prices.</p>
          </section>

          <section>
            <h2 className="h3 mb-2">Order economics {closed ? "(cost frozen when accepted)" : "(live, using available stock)"}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Revenue", money(order.total)],
                ["Cost", money(shownCost)],
                ["Profit", metrics ? money(metrics.profit) : "—"],
                ["Margin", metrics ? pct(metrics.marginPct) : "—"],
                ["Markup", metrics ? pct(metrics.markupPct) : "—"],
                ["Break-even total", money(shownCost)],
              ].map(([k, v]) => (
                <div key={k} className="card card-pad"><p className="text-xs text-fog-400">{k}</p><p className="mt-1 font-semibold tabular-nums">{v}</p></div>
              ))}
            </div>
            {s.extraCostPerOrder > 0 && <p className="mt-2 text-xs text-fog-500">Includes {money(s.extraCostPerOrder)} extra cost per order.</p>}
          </section>

          <section>
            <h2 className="h3 mb-2">Crafting plan</h2>
            {error && <p className="notice-bad">{error}</p>}
            {plan && (
              <div className="space-y-5">
                <PlanSummary plan={plan} />
                <RequirementsTable plan={plan} />
                <div className="grid gap-6 2xl:grid-cols-2">
                  <div><p className="h3 mb-2">To gather / buy</p><ShoppingList plan={plan} /></div>
                  <div><p className="h3 mb-2">Crafting steps</p><CraftingSteps plan={plan} /></div>
                </div>
              </div>
            )}
          </section>

          {order.reservations.length > 0 && (
            <section>
              <h2 className="h3 mb-2">Reserved stock</h2>
              <div className="flex flex-wrap gap-2">
                {order.reservations.map((r) => <span key={r.id} className="badge-neutral">{r.item.name}: {num(r.quantity)}</span>)}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          {next.length > 0 && (
            <div className="card card-pad">
              <h2 className="h3 mb-3">Change status</h2>
              <ActionForm action={changeStatusAction.bind(null, order.id)} className="space-y-3">
                <select name="status" className="input" defaultValue={next[0]}>
                  {next.map((n) => <option key={n} value={n}>{STATUS_LABEL[n]}</option>)}
                </select>
                <input name="note" className="input" placeholder="Message on the customer timeline (optional)" maxLength={1000} />
                <input name="reason" className="input" placeholder="Reason (required when cancelling)" maxLength={500} />
                <Submit>Update status</Submit>
                <p className="text-xs text-fog-500">Accepting reserves stock. Cancelling releases it. Completing deducts it.</p>
              </ActionForm>
            </div>
          )}

          <div className="card card-pad">
            <h2 className="h3 mb-3">Details</h2>
            <ActionForm action={updateOrderDetailsAction.bind(null, order.id)} className="space-y-3">
              <div>
                <label className="label">Expected delivery (UTC)</label>
                <input type="datetime-local" name="expectedDelivery" className="input" defaultValue={order.expectedDelivery ? order.expectedDelivery.toISOString().slice(0, 16) : ""} />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paymentReceived" className="check" defaultChecked={order.paymentReceived} /> Payment received in-game</label>
              <div>
                <label className="label">Private notes</label>
                <textarea name="adminNotes" rows={3} className="input" defaultValue={order.adminNotes} placeholder="Only you can see these" />
              </div>
              <Submit className="btn-secondary">Save details</Submit>
            </ActionForm>
          </div>

          {!closed && (
            <div className="card card-pad">
              <h2 className="h3 mb-3">Agreed total</h2>
              <ActionForm action={setQuotedTotalAction.bind(null, order.id)} className="space-y-3">
                <input name="total" className="input tabular-nums" inputMode="numeric" defaultValue={order.total} />
                <p className="text-xs text-fog-500">List subtotal {money(order.subtotal)}. Changing this adds a note to the customer timeline.{cost !== null && ` Break-even ${money(cost)}.`}</p>
                <Submit className="btn-secondary">Set total</Submit>
              </ActionForm>
            </div>
          )}

          <div className="card card-pad">
            <h2 className="h3 mb-4">Timeline</h2>
            <Timeline events={order.events.map((e) => ({ ...e, status: e.status as OrderStatus }))} />
          </div>
        </aside>
      </div>
    </>
  );
}
