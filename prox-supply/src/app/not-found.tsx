import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <p className="font-mono text-sm text-brand-400">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-fog-400">If you followed an order tracking link, check that you copied the whole link.</p>
        <Link href="/" className="btn-primary mt-6">Back to the shop</Link>
      </div>
    </div>
  );
}
