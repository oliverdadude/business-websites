import type { Metadata, Viewport } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Proximity Supply Co.", template: "%s · Proximity Supply Co." },
  description: "Independent bulk supplier for Proximity RP. Order large quantities, priced in in-game dollars.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#08090b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
