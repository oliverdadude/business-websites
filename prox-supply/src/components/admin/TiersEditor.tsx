"use client";
import { useState } from "react";
import type { Tier } from "@/lib/engine";

/** Editable discount tier rows, serialised to a hidden "tiers" field. */
export function TiersEditor({ initial, name = "tiers" }: { initial: Tier[]; name?: string }) {
  const [rows, setRows] = useState(initial.map((t) => ({ minQty: String(t.minQty), pct: String(t.pct) })));
  const value = JSON.stringify(rows.filter((r) => r.minQty !== "" || r.pct !== "").map((r) => ({ minQty: Number(r.minQty), pct: Number(r.pct) })));
  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-fog-500">No tiers: list price at every quantity.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-10 text-xs text-fog-500">From</span>
            <input className="input w-28 tabular-nums" inputMode="numeric" aria-label="Minimum quantity" value={r.minQty}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, minQty: e.target.value.replace(/[^\d]/g, "") } : x)))} />
            <span className="text-xs text-fog-500">units</span>
            <input className="input w-20 tabular-nums" inputMode="decimal" aria-label="Discount percent" value={r.pct}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pct: e.target.value.replace(/[^\d.]/g, "") } : x)))} />
            <span className="text-xs text-fog-500">% off</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove tier">✕</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => setRows([...rows, { minQty: "", pct: "" }])}>+ Add tier</button>
    </div>
  );
}
