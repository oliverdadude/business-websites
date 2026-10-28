import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { ORDER_NUMBER_RE, STATUS_LABEL, verifyToken, type OrderStatus } from "@/lib/orders";
import { dateTime, money, num, pct } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusSteps, Timeline } from "@/components/Timeline";
import { CopyLink } from "@/components/store/CopyLink";

export const metadata = { title: "Your order", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string; token: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { number, token } = await params;
  const { placed } = await searchParams;
  if (!ORDER_NUMBER_RE.test(number)) notFound();
  const order = await prisma.order.findUnique({
    where: { number },
    select: {
      number: true, trackingTokenHash: true, status: true, total: true, subtotal: true, discountTotal: true,
      createdAt: true, instructions: true, quoteRequested: true, expectedDelivery: true, rejectionReason: true,
      lines: { select: { id: true, itemName: true, quantity: true, unitPrice: true, discountPct: true, lineTotal: true } },
      events: { select: { id: true, status: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  // Same response for a wrong token and a missing order, so numbers can't be probed.
  if (!order || !verifyToken(token, order.trackingTokenHash)) notFound();
  const s = await getSettings();
  const status = order.status as OrderStatus;

  return (
    <div className="container-x max-w-4xl py-10">
      {placed && (
        <div className="notice-ok mb-6 animate-rise">
          <p className="font-semibold">Order placed: {order.number}</p>
          <p className="mt-1 text-fog-200">Bookmark this page. It is your private tracking link: anyone with it can see this order.</p>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="h3">Order</p>
          <h1 className="h1 font-mono">{order.number}</h1>
          <p className="mt-1 text-sm text-fog-400">Placed {dateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={status} />
          <CopyLink />
        </div>
      </div>

      <div className="card card-pad mt-6"><StatusSteps status={status} /></div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Total</th></tr></thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.itemName}{l.discountPct > 0 && <span className="ml-2 text-xs text-ok">−{pct(l.discountPct)}</span>}</td>
                    <td className="num">{num(l.quantity)}</td>
                    <td className="num">{money(l.unitPrice)}</td>
                    <td className="num font-medium">{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {order.instructions && (
            <div className="card card-pad">
              <p className="h3 mb-2">Your instructions</p>
              <p className="whitespace-pre-wrap text-sm text-fog-200">{order.instructions}</p>
            </div>
          )}
          <div className="card card-pad">
            <p className="h3 mb-4">Timeline</p>
            <Timeline events={order.events.map((e) => ({ ...e, status: e.status as OrderStatus }))} />
          </div>
        </div>
        <aside className="space-y-4">
          <div className="card card-pad">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-fog-400">Subtotal</dt><dd className="tabular-nums">{money(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-fog-400">Discounts</dt><dd className="tabular-nums text-ok">{order.discountTotal >= 0 ? `−${money(order.discountTotal)}` : `+${money(-order.discountTotal)}`}</dd></div>
              <div className="flex justify-between border-t border-ink-700 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(order.total)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-fog-500">In-game dollars.</p>
            {order.quoteRequested && <p className="notice-info mt-3 text-xs">Custom quote: the seller will confirm the final price.</p>}
          </div>
          <div className="card card-pad text-sm">
            <p className="font-medium">Status: {STATUS_LABEL[status]}</p>
            {order.expectedDelivery && status !== "COMPLETED" && status !== "CANCELLED" && (
              <p className="mt-1 text-fog-300">Expected: {dateTime(order.expectedDelivery)}</p>
            )}
            {order.rejectionReason && <p className="mt-1 text-bad">Reason: {order.rejectionReason}</p>}
            <p className="mt-3 text-fog-400">
              Payment and delivery happen in-game. You pay in Proximity RP dollars when you collect.
              {s.sellerDiscord && <> Contact <span className="text-fog-200">{s.sellerDiscord}</span> on Discord with your order number.</>}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
