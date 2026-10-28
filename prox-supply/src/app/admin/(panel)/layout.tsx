import Link from "next/link";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { logoutAction } from "@/server/admin-actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { Logo } from "@/components/Logo";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [s, pending, demo] = await Promise.all([
    getSettings(),
    prisma.order.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.item.count({ where: { isDemo: true } }),
  ]);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="relative border-b border-ink-800 bg-ink-900/60 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center justify-between px-4 lg:h-auto lg:flex-col lg:items-stretch lg:gap-6 lg:px-3 lg:py-5">
          <div className="lg:px-3">
            <Logo name={s.businessName} href="/admin" />
            <p className="mt-1 hidden text-[11px] font-semibold uppercase tracking-wider text-fog-500 lg:block">Seller admin</p>
          </div>
          <AdminNav pending={pending} />
        </div>
        <div className="hidden lg:absolute lg:inset-x-0 lg:bottom-0 lg:block lg:p-4">
          <div className="space-y-2 text-xs text-fog-500">
            <p className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${s.ordersOpen ? "bg-ok" : "bg-bad"}`} /> Orders {s.ordersOpen ? "open" : "closed"}
            </p>
            <Link href="/" className="block hover:text-fog-200">View storefront ↗</Link>
            <form action={logoutAction}><button className="hover:text-fog-200">Log out</button></form>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        {demo > 0 && (
          <div className="border-b border-info/20 bg-info/10 px-4 py-1.5 text-center text-xs text-info">
            Demo data is loaded ({demo} items). Remove it in <Link href="/admin/settings#demo" className="underline">Settings</Link> before going live.
          </div>
        )}
        <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        <div className="flex justify-center gap-4 pb-6 text-xs text-fog-500 lg:hidden">
          <Link href="/">Storefront</Link>
          <form action={logoutAction}><button>Log out</button></form>
        </div>
      </div>
    </div>
  );
}
