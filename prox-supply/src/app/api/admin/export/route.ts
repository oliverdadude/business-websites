import { NextResponse } from "next/server";
import { isAdmin } from "@/server/auth";
import { loadItems } from "@/server/catalog";
import { exportJson, exportRows, IMPORT_TYPES, toCsv, type ImportType } from "@/lib/import";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as ImportType;
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  if (!IMPORT_TYPES.includes(type)) return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
  const items = await loadItems();
  const date = new Date().toISOString().slice(0, 10);
  const body = format === "json" ? JSON.stringify(exportJson(type, items), null, 2) : toCsv(type, exportRows(type, items));
  return new NextResponse(body, {
    headers: {
      "Content-Type": format === "json" ? "application/json" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prox-supply-${type}-${date}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
