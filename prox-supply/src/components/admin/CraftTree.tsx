import type { TreeNode } from "@/lib/engine";
import { moneyUnit, num } from "@/lib/format";

function Node({ n, depth }: { n: TreeNode; depth: number }) {
  return (
    <li className="relative">
      <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${n.mode === "craft" ? "border-brand-700/50 bg-brand-500/5" : "border-ink-700 bg-ink-850"}`}>
        <span className="font-semibold tabular-nums">{num(n.quantity)}×</span>
        <span className="font-medium">{n.name}</span>
        {n.mode === "craft" ? (
          <span className="text-xs text-fog-400">craft {num(n.batches)} batch{n.batches === 1 ? "" : "es"}{n.outputQty && n.outputQty > 1 ? ` of ${n.outputQty}` : ""} · {n.recipeName}</span>
        ) : (
          <span className="text-xs text-fog-400">acquire</span>
        )}
        <span className="ml-auto text-xs tabular-nums text-fog-400">{moneyUnit(n.unitCost)}/u</span>
        {!n.verified && <span className="badge-warn">Unverified</span>}
      </div>
      {n.children.length > 0 && (
        <ul className="ml-4 mt-2 space-y-2 border-l border-ink-600 pl-4">
          {n.children.map((c) => <Node key={c.itemId} n={c} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

export function CraftTree({ tree }: { tree: TreeNode }) {
  return <ul className="space-y-2"><Node n={tree} depth={0} /></ul>;
}
