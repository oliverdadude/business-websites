"use client";
import Link from "next/link";
import { useCart } from "./cart";

export function CartButton() {
  const { lines } = useCart();
  const count = lines.length;
  return (
    <Link href="/cart" className="btn-secondary relative" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="20" r="1.4" />
        <circle cx="17" cy="20" r="1.4" />
      </svg>
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[11px] font-bold text-ink-950 animate-rise">
          {count}
        </span>
      )}
    </Link>
  );
}
