"use client";
import { useMemo, useState } from "react";
import { ProductCard } from "./ProductCard";
import type { PublicItem } from "./types";

export function CatalogBrowser({ items, ordersOpen, initialCategory }: { items: PublicItem[]; ordersOpen: boolean; initialCategory?: string }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(initialCategory ?? "All");
  const [sort, setSort] = useState<"popular" | "name" | "price-asc" | "price-desc">("popular");
  const categories = useMemo(() => ["All", ...[...new Set(items.map((i) => i.category))].sort()], [items]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items.filter(
      (i) => (cat === "All" || i.category === cat) && (!needle || i.name.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle)),
    );
    return list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "price-asc") return a.basePrice - b.basePrice;
      if (sort === "price-desc") return b.basePrice - a.basePrice;
      return Number(b.popular) - Number(a.popular) || Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name);
    });
  }, [items, q, cat, sort]);

  return (
    <div>
      <div className="sticky top-16 z-10 -mx-4 mb-6 border-b border-ink-800 bg-ink-950/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fog-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input className="input pl-9" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
          </div>
          <select className="input sm:w-48" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input sm:w-44" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="popular">Most popular</option>
            <option value="name">Name A–Z</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`btn-sm rounded-full border transition ${cat === c ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 text-fog-400 hover:text-fog-100"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="card card-pad text-center text-fog-400">
          {items.length === 0 ? "The catalogue is being stocked. Check back soon." : "No products match your search."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((i) => <ProductCard key={i.id} item={i} ordersOpen={ordersOpen} />)}
        </div>
      )}
    </div>
  );
}
