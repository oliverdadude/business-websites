"use client";
import { useState } from "react";
import { ActionForm, Submit } from "./ActionForm";
import type { ActionResult } from "@/lib/form";

interface Opt { id: string; name: string; kind: string }
interface Initial {
  name: string; isPrimary: boolean; outputQty: number; craftSeconds: number | null; station: string | null; skill: string | null;
  skillLevel: number | null; extraCostPerBatch: number; status: string; notes: string; ingredients: { itemId: string; quantity: number }[];
}

export function RecipeEditor({
  action, options, initial, submitLabel = "Save recipe",
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  options: Opt[];
  initial?: Initial;
  submitLabel?: string;
}) {
  const [ings, setIngs] = useState(
    (initial?.ingredients ?? [{ itemId: "", quantity: 1 }]).map((g) => ({ itemId: g.itemId, quantity: String(g.quantity) })),
  );
  const value = JSON.stringify(ings.filter((g) => g.itemId).map((g) => ({ itemId: g.itemId, quantity: Number(g.quantity) })));
  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="ingredients" value={value} />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="sm:col-span-2"><label className="label">Recipe name</label><input name="name" className="input" defaultValue={initial?.name ?? "Primary"} maxLength={60} /></div>
        <div><label className="label">Output per craft</label><input name="outputQty" className="input" inputMode="numeric" defaultValue={initial?.outputQty ?? 1} /></div>
        <div><label className="label">Craft time (sec/batch)</label><input name="craftSeconds" className="input" inputMode="numeric" placeholder="Unknown" defaultValue={initial?.craftSeconds ?? ""} /></div>
        <div><label className="label">Extra cost / batch</label><input name="extraCostPerBatch" className="input" inputMode="numeric" defaultValue={initial?.extraCostPerBatch ?? 0} /></div>
        <div>
          <label className="label">Status</label>
          <select name="status" className="input" defaultValue={initial?.status ?? "UNVERIFIED"}>
            <option value="UNVERIFIED">Unverified</option>
            <option value="VERIFIED">Verified</option>
          </select>
        </div>
        <div className="sm:col-span-2"><label className="label">Station</label><input name="station" className="input" defaultValue={initial?.station ?? ""} maxLength={80} /></div>
        <div className="sm:col-span-2"><label className="label">Skill</label><input name="skill" className="input" defaultValue={initial?.skill ?? ""} maxLength={80} /></div>
        <div><label className="label">Skill level</label><input name="skillLevel" className="input" inputMode="numeric" defaultValue={initial?.skillLevel ?? ""} /></div>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="isPrimary" className="check" defaultChecked={initial?.isPrimary ?? false} /> Primary recipe</label>
      </div>

      <div>
        <p className="label">Ingredients (per craft)</p>
        <div className="space-y-2">
          {ings.map((g, i) => (
            <div key={i} className="flex gap-2">
              <select className="input" value={g.itemId} aria-label="Ingredient" onChange={(e) => setIngs(ings.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>
                <option value="">Choose item…</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.kind.toLowerCase()})</option>)}
              </select>
              <input className="input w-28 tabular-nums" inputMode="numeric" aria-label="Quantity" value={g.quantity} onChange={(e) => setIngs(ings.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/[^\d]/g, "") } : x)))} />
              <button type="button" className="btn-ghost btn-sm" onClick={() => setIngs(ings.filter((_, j) => j !== i))} aria-label="Remove ingredient">✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setIngs([...ings, { itemId: "", quantity: "1" }])}>+ Add ingredient</button>
      </div>
      <div><label className="label">Notes / source</label><textarea name="notes" rows={2} className="input" defaultValue={initial?.notes ?? ""} placeholder="Where this recipe was verified, e.g. tested in-game on 2026-10-28" /></div>
      <Submit>{submitLabel}</Submit>
    </ActionForm>
  );
}
