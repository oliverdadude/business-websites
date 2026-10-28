import { craftingSteps, shoppingList, type Plan } from "@/lib/engine";
import { duration, money, moneyUnit, num } from "@/lib/format";

const acqLabel = { PURCHASE: "Buy", GATHER: "Gather", STOCK: "Stock only" } as const;

export function PlanSummary({ plan }: { plan: Plan }) {
  const c = plan.cost;
  return (
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div className="card card-pad"><p className="text-xs text-fog-400">Materials to buy/gather</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(c.materials)}</p></div>
      <div className="card card-pad"><p className="text-xs text-fog-400">Stock consumed (value)</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(c.stock)}</p></div>
      <div className="card card-pad"><p className="text-xs text-fog-400">Extra production costs</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(c.extras)}</p></div>
      <div className="card card-pad"><p className="text-xs text-fog-400">Crafting time</p><p className="mt-1 text-lg font-semibold tabular-nums">{duration(plan.craftSeconds)}{plan.unknownTimes.length > 0 && "+"}</p></div>
      {(!c.complete || plan.unknownTimes.length > 0 || plan.unverified.length > 0) && (
        <div className="col-span-full space-y-2">
          {!c.complete && <p className="notice-warn">Cost incomplete: no price for {c.unpriced.join(", ")}.</p>}
          {plan.unknownTimes.length > 0 && <p className="notice-info">Unknown craft time: {plan.unknownTimes.join(", ")}.</p>}
          {plan.unverified.length > 0 && <p className="notice-warn">Unverified recipe or price data: {plan.unverified.join(", ")}.</p>}
        </div>
      )}
    </div>
  );
}

export function RequirementsTable({ plan, stock }: { plan: Plan; stock?: Record<string, number> }) {
  const nodes = [...plan.nodes].sort((a, b) => b.stage - a.stage || a.name.localeCompare(b.name));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Item</th><th>Route</th><th className="num">Stage</th><th className="num">Required</th>
            {stock && <th className="num">Available</th>}
            <th className="num">From stock</th><th className="num">Batches</th><th className="num">Surplus</th>
            <th className="num">To get</th><th className="num">Cost</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.itemId}>
              <td className="font-medium">{n.name}{!n.verified && <span className="badge-warn ml-2">Unverified</span>}</td>
              <td className="text-xs text-fog-400">{n.mode === "craft" ? `Craft · ${n.recipeName}${n.station ? ` @ ${n.station}` : ""}` : acqLabel[n.acquisition]}</td>
              <td className="num">{n.stage}</td>
              <td className="num">{num(n.required)}</td>
              {stock && <td className="num text-fog-400">{num(stock[n.itemId] ?? 0)}</td>}
              <td className="num">{n.fromStock ? num(n.fromStock) : "—"}</td>
              <td className="num">{n.mode === "craft" ? num(n.batches) : "—"}</td>
              <td className="num">{n.surplus ? <span className="text-info">+{num(n.surplus)}</span> : "—"}</td>
              <td className="num">
                {n.shortfall > 0 ? <span className="text-bad">{num(n.shortfall)} short</span> : n.toAcquire ? num(n.toAcquire) : "—"}
              </td>
              <td className="num">{money((n.acquireCost ?? 0) + (n.stockCost ?? 0) + n.batchExtraCost)}{(n.acquireCost === null || n.stockCost === null) && <span className="text-warn"> ?</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ShoppingList({ plan }: { plan: Plan }) {
  const list = shoppingList(plan);
  if (list.length === 0) return <p className="text-sm text-fog-500">Nothing to gather or buy: stock covers everything.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Material</th><th>How</th><th className="num">Quantity</th><th className="num">Unit</th><th className="num">Cost</th></tr></thead>
        <tbody>
          {list.map((l) => (
            <tr key={l.itemId}>
              <td>{l.name}</td>
              <td className="text-xs">{l.shortfall ? <span className="text-bad">Stock only, short</span> : acqLabel[l.acquisition]}</td>
              <td className="num">{num(l.quantity)}</td>
              <td className="num">{moneyUnit(l.unitCost)}</td>
              <td className="num">{money(l.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CraftingSteps({ plan }: { plan: Plan }) {
  const steps = craftingSteps(plan);
  if (steps.length === 0) return <p className="text-sm text-fog-500">No crafting needed.</p>;
  const stages = [...new Set(steps.map((s) => s.stage))];
  return (
    <ol className="space-y-4">
      {stages.map((st) => (
        <li key={st}>
          <p className="h3 mb-2">Stage {st}</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {steps.filter((s) => s.stage === st).map((s) => (
              <div key={s.itemId} className="card card-pad">
                <p className="font-medium">{s.name}</p>
                <p className="mt-1 text-sm text-fog-300">{num(s.batches)} × craft → {num(s.produced)} units{s.surplus ? <span className="text-info"> (+{num(s.surplus)} surplus)</span> : ""}</p>
                <p className="mt-1 text-xs text-fog-500">{s.recipeName}{s.station ? ` · ${s.station}` : ""} · {s.craftSeconds === null ? "time unknown" : duration(s.craftSeconds)}</p>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
