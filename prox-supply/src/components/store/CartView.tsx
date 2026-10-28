"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { money, moneyUnit, num, pct } from "@/lib/format";
import { useCart, useQuote } from "./cart";

function QtyInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const commit = (s: string) => {
    const n = Number(s);
    if (Number.isInteger(n) && n >= 1 && n <= 1_000_000) onCommit(n);
  };
  return (
    <input
      inputMode="numeric"
      aria-label="Quantity"
      className="input w-28 tabular-nums"
      value={raw}
      onChange={(e) => {
        const s = e.target.value.replace(/[^\d]/g, "").slice(0, 7);
        setRaw(s);
        commit(s);
      }}
      onBlur={() => setRaw(String(value))}
    />
  );
}

export function CartView({ ordersOpen }: { ordersOpen: boolean }) {
  const { lines, setQty, remove, clear } = useCart();
  const { quote, loading, error } = useQuote(lines);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="card card-pad h-40 animate-pulse" />;
  if (lines.length === 0) {
    return (
      <div className="card card-pad py-14 text-center">
        <p className="text-lg font-medium">Your cart is empty</p>
        <p className="mt-1 text-fog-400">Browse the catalogue and add the quantities you need.</p>
        <Link href="/catalog" className="btn-primary mt-6">Start Ordering</Link>
      </div>
    );
  }

  const errorFor = (id: string) => quote?.errors.find((e) => e.itemId === id)?.message;
  const lineFor = (id: string) => quote?.lines.find((l) => l.itemId === id);
  const blocked = !quote || quote.errors.length > 0 || !ordersOpen || !!error;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        {lines.map((l) => {
          const ql = lineFor(l.itemId);
          const err = errorFor(l.itemId);
          return (
            <div key={l.itemId} className={`card card-pad flex flex-col gap-3 sm:flex-row sm:items-center ${err ? "border-bad/40" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{ql?.name ?? l.name ?? "Item"}</p>
                {ql && (
                  <p className="text-sm text-fog-400">
                    {money(ql.unitPrice)} / unit
                    {ql.appliedPct > 0 && <span className="ml-2 text-ok">−{pct(ql.appliedPct)} bulk discount</span>}
                  </p>
                )}
                {err && <p className="mt-1 text-sm text-bad">{err} Remove it to continue.</p>}
                {ql?.discountLimited && <p className="mt-1 text-xs text-warn">The full tier discount isn&apos;t available on this item.</p>}
                {ql?.quoteRequired && <p className="mt-1 text-xs text-info">Needs a custom quote: the seller will confirm the final price before you pay.</p>}
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <QtyInput value={l.quantity} onCommit={(n) => setQty(l.itemId, n)} />
                <div className="w-28 text-right">
                  <p className={`font-semibold tabular-nums ${loading ? "opacity-50" : ""}`}>{ql ? money(ql.lineTotal) : "—"}</p>
                  {ql && ql.discount > 0 && <p className="text-xs text-fog-500 line-through tabular-nums">{money(ql.subtotal)}</p>}
                  {ql && ql.appliedPct > 0 && <p className="text-[11px] text-fog-500">{moneyUnit(ql.lineTotal / ql.quantity)}/unit</p>}
                </div>
                <button onClick={() => remove(l.itemId)} className="btn-ghost btn-sm" aria-label={`Remove ${ql?.name ?? "item"}`}>✕</button>
              </div>
            </div>
          );
        })}
        <button onClick={clear} className="btn-ghost btn-sm">Clear cart</button>
      </div>

      <aside className="card card-pad h-fit lg:sticky lg:top-24">
        <h2 className="h3 mb-4">Summary</h2>
        {error && <p className="notice-bad mb-3">{error}</p>}
        <dl className={`space-y-2 text-sm ${loading ? "opacity-60" : ""}`}>
          <div className="flex justify-between"><dt className="text-fog-400">Items</dt><dd className="tabular-nums">{num(lines.reduce((a, l) => a + l.quantity, 0))}</dd></div>
          <div className="flex justify-between"><dt className="text-fog-400">Subtotal</dt><dd className="tabular-nums">{money(quote?.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-fog-400">Bulk discounts</dt><dd className="tabular-nums text-ok">{quote ? `−${money(quote.discount)}` : "—"}</dd></div>
          <div className="flex justify-between border-t border-ink-700 pt-3 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(quote?.total)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-fog-500">In-game dollars. Prices are checked again by the server at checkout.</p>
        {quote?.quoteRequired && <p className="notice-info mt-3 text-xs">Your order includes a large line that needs a custom quote. The total above is provisional.</p>}
        {!ordersOpen && <p className="notice-warn mt-3">Orders are closed right now.</p>}
        {blocked ? (
          <button className="btn-primary mt-5 w-full" disabled>Checkout</button>
        ) : (
          <Link href="/checkout" className="btn-primary mt-5 w-full">Checkout</Link>
        )}
        <p className="mt-3 text-center text-xs text-fog-500">You pay in-game when your order is delivered.</p>
      </aside>
    </div>
  );
}
