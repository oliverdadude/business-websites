import Link from "next/link";
import { getSettings } from "@/server/settings";
import { getPublicItems } from "@/server/storefront";
import { ProductCard } from "@/components/store/ProductCard";
import { num, pct } from "@/lib/format";

const STEPS = [
  { t: "Build your order", d: "Pick products and type any quantity. Bulk discounts apply automatically." },
  { t: "Send it in", d: "Check out with your in-game name and Discord. You get an order number and a private tracking link." },
  { t: "We gather & craft", d: "Your order is approved, materials gathered and everything crafted. Track each stage live." },
  { t: "Pay & collect in-game", d: "Meet in-game when it's ready. Payment and hand-over happen on the server." },
];

export default async function Home() {
  const [s, items] = await Promise.all([getSettings(), getPublicItems()]);
  const featured = items.filter((i) => i.featured).slice(0, 6);
  const popular = items.filter((i) => i.popular && !i.featured).slice(0, 6);
  const tiers = [...s.defaultTiers].sort((a, b) => a.minQty - b.minQty);

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-800">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden="true" />
        <div className="absolute -top-40 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" aria-hidden="true" />
        <div className="container-x relative py-16 sm:py-24">
          <span className="badge-brand animate-rise">Bulk supply · Proximity RP</span>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl animate-rise">
            Wholesale materials and crafted goods, <span className="text-brand-400">by the thousand.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-fog-300 animate-rise">
            {s.businessName} supplies large orders to players across the server. Clear prices, automatic bulk discounts and
            live order tracking.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 animate-rise">
            <Link href="/catalog" className="btn-primary btn-lg">Start Ordering →</Link>
            <Link href="#how-it-works" className="btn-secondary btn-lg">How it works</Link>
          </div>
          <p className="mt-6 text-sm text-fog-500">All prices in in-game dollars. Payment and delivery happen in-game.</p>
        </div>
      </section>

      <section id="how-it-works" className="container-x scroll-mt-20 py-14">
        <h2 className="h3">How bulk ordering works</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((st, i) => (
            <li key={st.t} className="card card-pad">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15 text-sm font-semibold text-brand-300">{i + 1}</span>
              <p className="mt-3 font-semibold">{st.t}</p>
              <p className="mt-1 text-sm text-fog-400">{st.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {featured.length > 0 && (
        <section className="container-x py-6">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="h2">Featured</h2>
            <Link href="/catalog" className="text-sm text-brand-400 hover:text-brand-300">View all →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((i) => <ProductCard key={i.id} item={i} ordersOpen={s.ordersOpen} />)}
          </div>
        </section>
      )}

      {popular.length > 0 && (
        <section className="container-x py-6">
          <h2 className="h2 mb-5">Popular with bulk buyers</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((i) => <ProductCard key={i.id} item={i} ordersOpen={s.ordersOpen} />)}
          </div>
        </section>
      )}

      {items.length === 0 && (
        <section className="container-x py-6">
          <div className="card card-pad text-center text-fog-400">The catalogue is being stocked. Check back soon.</div>
        </section>
      )}

      <section className="container-x py-14">
        <div className="card overflow-hidden lg:grid lg:grid-cols-[1fr_1.2fr]">
          <div className="card-pad border-b border-ink-700 lg:border-b-0 lg:border-r lg:p-8">
            <h2 className="h2">Bulk discount tiers</h2>
            <p className="mt-2 text-sm text-fog-400">
              The more you order, the less each unit costs. Discounts apply per product line. Some products have their own tiers,
              shown on each product card. Very large orders get a custom quote.
            </p>
            <Link href="/catalog" className="btn-primary mt-6">Start Ordering</Link>
          </div>
          <div className="card-pad lg:p-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-fog-500">
                  <th className="pb-2 font-medium">Quantity per product</th>
                  <th className="pb-2 text-right font-medium">Discount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-ink-800"><td className="py-2.5">1 – {num((tiers[0]?.minQty ?? 2) - 1)}</td><td className="text-right text-fog-400">List price</td></tr>
                {tiers.map((t, i) => (
                  <tr key={t.minQty} className="border-t border-ink-800">
                    <td className="py-2.5 tabular-nums">{num(t.minQty)}{tiers[i + 1] ? ` – ${num(tiers[i + 1].minQty - 1)}` : "+"}</td>
                    <td className="text-right font-semibold text-brand-300 tabular-nums">−{pct(t.pct)}</td>
                  </tr>
                ))}
                {s.defaultQuoteThreshold && (
                  <tr className="border-t border-ink-800"><td className="py-2.5 tabular-nums">{num(s.defaultQuoteThreshold)}+</td><td className="text-right text-info">Custom quote</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
