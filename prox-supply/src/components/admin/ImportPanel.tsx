"use client";
import { useActionState, useState } from "react";
import { commitImportAction, previewImportAction } from "@/server/admin-actions";
import type { ImportPreview } from "@/server/import-types";
import { IMPORT_TYPES } from "@/lib/import";

export function ImportPanel() {
  const [type, setType] = useState<(typeof IMPORT_TYPES)[number]>("materials");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [text, setText] = useState("");
  const [previewState, preview, previewing] = useActionState(previewImportAction, null);
  const [commitState, commit, committing] = useActionState(commitImportAction, null);
  const p = previewState?.data as ImportPreview | undefined;
  const fresh = p && p.type === type;
  const canCommit = fresh && previewState?.ok && p.errors.length === 0;

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) return alert("File is too large (2 MB max).");
    setText(await f.text());
    if (f.name.toLowerCase().endsWith(".json")) setFormat("json");
    else setFormat("csv");
  }

  const hidden = (
    <>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="format" value={format} />
      <input type="hidden" name="text" value={text} />
    </>
  );

  return (
    <section className="card card-pad space-y-4">
      <h2 className="h3">Import</h2>
      <div className="flex flex-wrap gap-2">
        <select className="input w-44" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Data type">
          {IMPORT_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select className="input w-28" value={format} onChange={(e) => setFormat(e.target.value as "csv" | "json")} aria-label="Format">
          <option value="csv">CSV</option><option value="json">JSON</option>
        </select>
        <input type="file" accept=".csv,.json,text/csv,application/json" className="input w-auto flex-1 file:mr-3 file:rounded file:border-0 file:bg-ink-700 file:px-2 file:py-1 file:text-fog-100" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <textarea className="input font-mono text-xs" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste CSV / JSON here" spellCheck={false} />
      <div className="flex flex-wrap gap-2">
        <form action={preview}>{hidden}<button className="btn-secondary" disabled={previewing || !text.trim()}>{previewing ? "Checking…" : "Preview & validate"}</button></form>
        <form action={commit} onSubmit={(e) => { if (!window.confirm(`Import ${p?.rowCount ?? 0} ${type} row(s)?`)) e.preventDefault(); }}>
          {hidden}
          <button className="btn-primary" disabled={!canCommit || committing}>{committing ? "Importing…" : "Confirm import"}</button>
        </form>
      </div>
      {previewState && !previewState.data && <p className="notice-bad">{previewState.message}</p>}
      {commitState && <p className={commitState.ok ? "notice-ok" : "notice-bad"}>{commitState.message}</p>}

      {fresh && p && (
        <div className="space-y-3">
          <p className={previewState?.ok ? "notice-ok" : "notice-bad"}>
            {previewState?.message} {p.rowCount} {type === "recipes" ? "recipe(s)" : "row(s)"} · {p.creates} new · {p.updates} update(s).
          </p>
          {p.errors.length > 0 && (
            <div className="table-wrap max-h-72 overflow-y-auto">
              <table className="table"><thead><tr><th>Row</th><th>Field</th><th>Problem</th></tr></thead>
                <tbody>{p.errors.map((e, i) => <tr key={i}><td className="tabular-nums">{e.row || "—"}</td><td className="font-mono text-xs">{e.field ?? ""}</td><td className="text-bad">{e.message}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {p.warnings.map((w, i) => <p key={i} className="notice-warn text-xs">{w.row ? `Row ${w.row}: ` : ""}{w.message}</p>)}
          {p.cycles.length > 0 && (
            <div className="notice-warn text-xs">
              <p className="font-semibold">Circular dependencies after this import:</p>
              <ul className="mt-1 list-inside list-disc">{p.cycles.map((c, i) => <li key={i}>{c.join(" → ")}</li>)}</ul>
              <p className="mt-1">Items whose only recipe loops can&apos;t be planned. Fix them before approving orders for those items.</p>
            </div>
          )}
          {p.sample.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-fog-300">Preview parsed rows ({Math.min(50, p.rowCount)} shown)</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-ink-850 p-3 text-[11px] text-fog-300">{JSON.stringify(p.sample, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
