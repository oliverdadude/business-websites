"use client";
import { useMemo, useState } from "react";
import { tierFor } from "@/lib/engine/pricing";
import { money, moneyUnit, num, pct } from "@/lib/format";
import { useCart, useQuote } from "./cart";
import type { PublicItem } from "./types";

export function ProductCard({ item, ordersOpen }: { item: PublicItem; ordersOpen: boolean }) {
  const { add } = useCart();
  const [raw, setRaw] = useState("1");
  const [added, setAdded] = useState(false);
  const qty = Number(raw);
  const valid = Number.isInteger(qty) && qty >= 1 && qty <= 1_000_000;
  const tierPct = valid ? tierFor(item.tiers, qty) : 0;
  const nextTier = useMemo(
    () => (valid ? [...item.tiers].sort((a, b) => a.minQty - b.minQty).find((t) => t.minQty > qty && t.pct > tierPct) : undefined),
    [item.tiers, qty, valid, tierPct],
  );
  const lines = useMemo(() => (valid && qty > 1 ? [{ itemId: item.id, quantity: qty }] : []), [item.id, qty, valid]);
  const { quote, loading } = useQuote(lines, 350);
  const line = quote?.lines[0];
  const total = valid ? (qty === 1 ? item.basePrice : line?.lineTotal) : undefined;
  const quoteNeeded = valid && item.quoteThreshold !== null && qty >= item.quoteThreshold;

  return (
    <article className="card group flex flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-ink-600 hover:shadow-[0_8px_30px_-12px_rgba(245,165,36,.25)] animate-rise">
      <div className="relative border-b border-ink-700 bg-gradient-to-br from-ink-800 to-ink-900 px-4 pb-4 pt-5">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="badge-neutral">{item.category}</span>
          {item.popular && <span className="badge-brand">Popular</span>}
          {item.featured && <span className="badge-info">Featured</span>}
        </div>
        <h3 className="text-lg font-semibold leading-snug tracking-tight">{item.name}</h3>
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-fog-400">{item.description}</p>}
        <p className="mt-3 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{money(item.basePrice)}</span>
          <span className="text-xs text-fog-400">per unit · in-game $</span>
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {item.tiers.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Bulk discounts">
            {[...item.tiers]
              .sort((a, b) => a.minQty - b.minQty)
              .map((t) => (
                <li
                  key={t.minQty}
                  className={`rounded-md border px-2 py-0.5 text-[11px] tabular-nums transition ${
                    valid && qty >= t.minQty && t.pct === tierPct ? "border-brand-500/60 bg-brand-500/15 text-brand-300" : "border-ink-600 text-fog-400"
                  }`}
                >
                  {num(t.minQty)}+ <span className="font-semibold">−{pct(t.pct)}</span>
                </li>
              ))}
          </ul>
        )}

        <div className="mt-auto">
          <label className="label" htmlFor={`qty-${item.id}`}>Quantity</label>
          <div className="flex gap-2">
            <input
              id={`qty-${item.id}`}
              inputMode="numeric"
              className="input tabular-nums"
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
              aria-invalid={!valid}
            />
            <button
              className="btn-primary shrink-0"
              disabled={!valid || !ordersOpen}
              onClick={() => {
                add(item.id, qty, item.name);
                setAdded(true);
                setTimeout(() => setAdded(false), 1600);
              }}
            >
              {added ? "Added ✓" : "Add to cart"}
            </button>
          </div>
          <div className="mt-2 min-h-[2.5rem] text-xs" aria-live="polite">
            {!valid ? (
              <p className="text-bad">Enter a whole number from 1 to 1,000,000.</p>
            ) : (
              <>
                <p className="flex justify-between text-fog-300">
                  <span>
                    {num(qty)} × {money(item.basePrice)}
                    {line && line.appliedPct > 0 && <span className="ml-1 text-ok">−{pct(line.appliedPct)}</span>}
                    {!line && tierPct > 0 && <span className="ml-1 text-fog-400">(up to −{pct(tierPct)})</span>}
                  </span>
                  <span className={`font-semibold tabular-nums text-fog-100 ${loading ? "opacity-50" : ""}`}>{total !== undefined ? money(total) : "…"}</span>
                </p>
                {line && line.appliedPct > 0 && <p className="text-fog-400">{moneyUnit(line.lineTotal / qty)} per unit</p>}
                {line?.discountLimited && <p className="text-warn">Discount limited for this item.</p>}
                {quoteNeeded && <p className="text-info">Large order: final price confirmed by custom quote.</p>}
                {!quoteNeeded && nextTier && <p className="text-fog-500">Order {num(nextTier.minQty)}+ for up to −{pct(nextTier.pct)}</p>}
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
