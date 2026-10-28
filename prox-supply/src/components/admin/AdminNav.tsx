"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/production", label: "Production" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/items", label: "Items & recipes" },
  { href: "/admin/profitability", label: "Profitability" },
  { href: "/admin/import", label: "Import / export" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({ pending }: { pending: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/admin" ? path === "/admin" : path.startsWith(h));
  return (
    <>
      <button className="btn-secondary btn-sm lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="admin-nav">
        Menu
      </button>
      <nav id="admin-nav" className={`${open ? "block" : "hidden"} absolute inset-x-0 top-14 z-30 border-b border-ink-700 bg-ink-900 p-2 lg:static lg:block lg:border-0 lg:bg-transparent lg:p-0`}>
        <ul className="flex flex-col gap-0.5">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${active(l.href) ? "bg-ink-800 text-fog-100" : "text-fog-400 hover:bg-ink-850 hover:text-fog-100"}`}
              >
                {l.label}
                {l.href === "/admin/orders" && pending > 0 && <span className="rounded-full bg-warn/15 px-1.5 text-[11px] font-semibold text-warn">{pending}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
