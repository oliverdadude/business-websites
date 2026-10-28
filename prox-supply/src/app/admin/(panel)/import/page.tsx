import { PageHeader } from "@/components/admin/Stat";
import { ImportPanel } from "@/components/admin/ImportPanel";
import { IMPORT_TYPES } from "@/lib/import";

export const metadata = { title: "Import / export" };

const DESC: Record<string, string> = {
  materials: "Raw materials (kind RAW). Creates new items or updates existing ones by name.",
  products: "Intermediates and finished products. Creates or updates by name.",
  recipes: "One row per ingredient. Rows with the same item + recipe name form one recipe and replace it if it exists.",
  prices: "Updates prices of existing items. Blank cells are left unchanged; write none to clear.",
  inventory: "Sets on-hand counts for existing items and logs each change with the reason.",
};

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import / export" sub="CSV or JSON. Every import is previewed and validated before anything is saved. Imports run in one transaction: all rows or none." />
      <section className="card card-pad mb-6">
        <h2 className="h3 mb-3">Export & templates</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Data</th><th>What it contains</th><th>Export</th><th>Template</th></tr></thead>
            <tbody>
              {IMPORT_TYPES.map((t) => (
                <tr key={t}>
                  <td className="font-medium capitalize">{t}</td>
                  <td className="text-sm text-fog-400">{DESC[t]}</td>
                  <td className="whitespace-nowrap">
                    <a className="btn-secondary btn-sm" href={`/api/admin/export?type=${t}&format=csv`}>CSV</a>{" "}
                    <a className="btn-secondary btn-sm" href={`/api/admin/export?type=${t}&format=json`}>JSON</a>
                  </td>
                  <td className="whitespace-nowrap">
                    <a className="btn-ghost btn-sm" href={`/templates/${t}.csv`} download>CSV</a>{" "}
                    <a className="btn-ghost btn-sm" href={`/templates/${t}.json`} download>JSON</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-fog-500">Template files contain placeholder rows named &quot;Example …&quot;. Replace them with your verified data before importing.</p>
      </section>
      <ImportPanel />
    </>
  );
}
