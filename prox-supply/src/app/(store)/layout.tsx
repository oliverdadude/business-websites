import Link from "next/link";
import { Logo } from "@/components/Logo";
import { CartButton } from "@/components/store/CartButton";
import { getSettings } from "@/server/settings";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/85 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between gap-3">
          <Logo name={s.businessName} />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="/catalog" className="btn-ghost">Catalogue</Link>
            <Link href="/#how-it-works" className="btn-ghost hidden md:inline-flex">How it works</Link>
            <CartButton />
          </nav>
        </div>
        {!s.ordersOpen && (
          <div className="border-t border-warn/20 bg-warn/10 py-1.5 text-center text-xs text-warn">
            Orders are closed right now. You can browse, but checkout is paused.
          </div>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-ink-800 bg-ink-900/40">
        <div className="container-x grid gap-6 py-10 text-sm text-fog-400 md:grid-cols-3">
          <div>
            <Logo name={s.businessName} />
            <p className="mt-3 max-w-xs">Bulk materials and crafted goods for players on Proximity RP.</p>
          </div>
          <div>
            <p className="h3 mb-2">Good to know</p>
            <ul className="space-y-1.5">
              <li>All prices are Proximity RP in-game dollars.</li>
              <li>Payment and delivery happen in-game. No real money.</li>
              {s.sellerDiscord && <li>Questions? Discord: <span className="text-fog-200">{s.sellerDiscord}</span></li>}
            </ul>
          </div>
          <div>
            <p className="h3 mb-2">Independent business</p>
            <p>
              {s.businessName} is an independent, player-run shop. It is not an official Proximity RP website and is not
              affiliated with or endorsed by the Proximity RP team.
            </p>
          </div>
        </div>
        <div className="container-x flex justify-between border-t border-ink-800 py-4 text-xs text-fog-500">
          <span>© {new Date().getFullYear()} {s.businessName}</span>
          <Link href="/admin" className="hover:text-fog-300">Seller login</Link>
        </div>
      </footer>
    </div>
  );
}
