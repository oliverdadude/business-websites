import Link from "next/link";
import { prisma } from "@/server/db";
import { inventoryRows } from "@/server/admin-data";
import { adjustStockAction } from "@/server/admin-actions";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { PageHeader } from "@/components/admin/Stat";
import { dateTime, money, moneyUnit, num } from "@/lib/format";

export const metadata = { title: "Inventory" };

const KIND_LABEL = { RAW: "Raw materials", INTERMEDIATE: "Intermediate items", PRODUCT: "Finished products" } as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [{ rows }, log] = await Promise.all([
    inventoryRows(),
    prisma.inventoryAdjustment.findMany({ include: { item: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  const needle = q?.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => r.item.name.toLowerCase().includes(needle)) : rows;
  const total = rows.reduce((a, r) => a + (r.stockValue ?? 0), 0);
  return (
    <>
      <PageHeader
        title="Inventory"
        sub={<>Stock you hold. <strong className="text-warn">Not synced with the game</strong>: update counts here after gathering, crafting or trading.</>}
        actions={<form><input name="q" defaultValue={q} placeholder="Search items" className="input w-52" /></form>}
      />
      <p className="mb-4 text-sm text-fog-400">Total value on hand: <span className="font-semibold text-fog-100">{money(total)}</span>. Reserved = held for accepted orders; available = on hand − reserved.</p>
      {(["RAW", "INTERMEDIATE", "PRODUCT"] as const).map((k) => {
        const list = shown.filter((r) => r.item.kind === k);
        if (list.length === 0) return null;
        return (
          <section key={k} className="mb-8">
            <h2 className="h3 mb-2">{KIND_LABEL[k]}</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Item</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">Available</th><th className="num">Unit value</th><th className="num">Value</th><th>Correction</th></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.item.id}>
                      <td>
                        <Link href={`/admin/items/${r.item.id}`} className="hover:text-brand-300">{r.item.name}</Link>
                        {r.low && <span className="badge-warn ml-2">Low</span>}
                        {r.item.isDemo && <span className="badge-info ml-2">Demo</span>}
                      </td>
                      <td className="num">{num(r.onHand)}</td>
                      <td className="num">{r.reserved ? num(r.reserved) : "—"}</td>
                      <td className={`num font-medium ${r.low ? "text-warn" : ""}`}>{num(r.available)}</td>
                      <td className="num text-fog-400">{moneyUnit(r.unitValue)}</td>
                      <td className="num">{money(r.stockValue)}</td>
                      <td className="min-w-[22rem]">
                        <ActionForm action={adjustStockAction.bind(null, r.item.id)} className="flex flex-wrap items-center gap-1.5" resetOnSuccess inlineMessage>
                          <select name="mode" className="input-sm w-20" aria-label="Mode"><option value="set">Set to</option><option value="add">Add ±</option></select>
                          <input name="value" className="input-sm w-20 tabular-nums" inputMode="numeric" placeholder={String(r.onHand)} aria-label="Quantity" required />
                          <input name="reason" className="input-sm w-36" placeholder="Reason" aria-label="Reason" required maxLength={300} />
                          <Submit className="btn-secondary btn-sm">Save</Submit>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <section>
        <h2 className="h3 mb-2">Adjustment log</h2>
        {log.length === 0 ? <p className="text-sm text-fog-500">No adjustments yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Item</th><th className="num">Change</th><th>Reason</th></tr></thead>
              <tbody>
                {log.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-xs text-fog-400">{dateTime(a.createdAt)}</td>
                    <td>{a.item.name}</td>
                    <td className={`num ${a.delta < 0 ? "text-bad" : "text-ok"}`}>{a.delta > 0 ? "+" : ""}{num(a.delta)}</td>
                    <td className="text-sm text-fog-300">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
