import Link from "next/link";

export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" className="fill-brand-500" />
      <path d="M9 23V9h7.2c3.2 0 5.3 1.9 5.3 4.7s-2.1 4.7-5.3 4.7H13v4.6H9Zm4-8h2.9c1.1 0 1.7-.5 1.7-1.3s-.6-1.4-1.7-1.4H13V15Z" className="fill-ink-950" />
      <rect x="18.5" y="19.5" width="4.5" height="3.5" rx="1" className="fill-ink-950" />
    </svg>
  );
}

export function Logo({ name, href = "/" }: { name: string; href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label={`${name} home`}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-fog-100">
        {name.replace(/ Co\.$/, "")}
        {name.endsWith(" Co.") && <span className="text-brand-400"> Co.</span>}
      </span>
    </Link>
  );
}
