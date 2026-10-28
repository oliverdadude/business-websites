"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { money, num } from "@/lib/format";
import { useCart, useQuote } from "./cart";

const KEY_STORE = "prx-checkout-key";

function submissionKey(): string {
  try {
    const k = sessionStorage.getItem(KEY_STORE);
    if (k) return k;
    const n = crypto.randomUUID();
    sessionStorage.setItem(KEY_STORE, n);
    return n;
  } catch {
    return crypto.randomUUID();
  }
}

export function CheckoutForm({ ordersOpen, sellerDiscord }: { ordersOpen: boolean; sellerDiscord: string }) {
  const router = useRouter();
  const { lines, clear } = useCart();
  const { quote, loading, error: quoteError, refresh } = useQuote(lines, 0);
  const [form, setForm] = useState({ ign: "", discord: "", instructions: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="card card-pad h-60 animate-pulse" />;
  if (lines.length === 0) {
    return (
      <div className="card card-pad py-12 text-center">
        <p className="font-medium">Your cart is empty.</p>
        <Link href="/catalog" className="btn-primary mt-5">Browse the catalogue</Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !quote) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
          ...form,
          idempotencyKey: submissionKey(),
          expectedTotal: quote.total,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        try {
          sessionStorage.removeItem(KEY_STORE);
          localStorage.setItem("prx-last-order", JSON.stringify({ number: data.number, url: data.trackingUrl }));
        } catch {}
        clear();
        router.push(`${data.trackingUrl}?placed=1`);
        return;
      }
      if (data.details?.priceChanged) await refresh();
      setFieldErrors(data.fieldErrors ?? {});
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Your order was not confirmed; please try again (you won't be charged twice).");
    } finally {
      setSubmitting(false);
    }
  }

  const fe = (k: string) => fieldErrors[k]?.[0];
  const blocked = !ordersOpen || !quote || quote.errors.length > 0;

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_22rem]" noValidate>
      <div className="card card-pad space-y-4">
        <h2 className="h2">Your details</h2>
        <div>
          <label className="label" htmlFor="ign">In-game name *</label>
          <input id="ign" className="input" autoComplete="off" required maxLength={48} value={form.ign} onChange={(e) => setForm({ ...form, ign: e.target.value })} aria-invalid={!!fe("ign")} />
          {fe("ign") && <p className="mt-1 text-xs text-bad">{fe("ign")}</p>}
        </div>
        <div>
          <label className="label" htmlFor="discord">Discord username *</label>
          <input id="discord" className="input" autoComplete="off" required maxLength={40} placeholder="e.g. supplyfan" value={form.discord} onChange={(e) => setForm({ ...form, discord: e.target.value })} aria-invalid={!!fe("discord")} />
          {fe("discord") ? <p className="mt-1 text-xs text-bad">{fe("discord")}</p> : <p className="mt-1 text-xs text-fog-500">Used only to arrange delivery in-game.</p>}
        </div>
        <div>
          <label className="label" htmlFor="instructions">Instructions (optional)</label>
          <textarea id="instructions" rows={4} maxLength={1000} className="input" placeholder="Preferred delivery time, location, anything else…" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </div>
        <div className="notice-info text-sm">
          <p className="font-medium text-fog-100">Payment and delivery happen in-game.</p>
          <p className="mt-1 text-fog-300">
            Nothing is charged here. Once your order is ready, the seller{sellerDiscord ? ` (${sellerDiscord} on Discord)` : ""} will arrange to meet you on
            Proximity RP, where you pay in in-game dollars and receive your items.
          </p>
        </div>
      </div>

      <aside className="card card-pad h-fit lg:sticky lg:top-24">
        <h2 className="h3 mb-4">Order summary</h2>
        <ul className={`space-y-2 text-sm ${loading ? "opacity-60" : ""}`}>
          {quote?.lines.map((l) => (
            <li key={l.itemId} className="flex justify-between gap-3">
              <span className="min-w-0 truncate"><span className="tabular-nums text-fog-400">{num(l.quantity)}×</span> {l.name}</span>
              <span className="tabular-nums">{money(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        {quote && quote.errors.length > 0 && <p className="notice-bad mt-3">Some items can&apos;t be ordered. <Link href="/cart" className="underline">Review your cart</Link>.</p>}
        <dl className="mt-4 space-y-1.5 border-t border-ink-700 pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-fog-400">Discounts</dt><dd className="text-ok tabular-nums">−{money(quote?.discount ?? 0)}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(quote?.total)}</dd></div>
        </dl>
        {quote?.quoteRequired && <p className="notice-info mt-3 text-xs">Includes a custom-quote line. The seller confirms the final price before delivery.</p>}
        {quoteError && <p className="notice-bad mt-3">{quoteError}</p>}
        {error && <p className="notice-bad mt-3" role="alert">{error}</p>}
        {!ordersOpen && <p className="notice-warn mt-3">Orders are closed right now.</p>}
        <button type="submit" className="btn-primary mt-5 w-full" disabled={blocked || submitting || loading}>
          {submitting ? "Placing order…" : "Place order"}
        </button>
        <Link href="/cart" className="btn-ghost mt-2 w-full">Back to cart</Link>
      </aside>
    </form>
  );
}
