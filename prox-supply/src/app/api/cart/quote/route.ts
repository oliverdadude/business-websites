import { NextResponse } from "next/server";
import { publicQuote, quoteCart } from "@/server/catalog";
import { quoteRequestSchema } from "@/lib/schemas";
import { limits } from "@/server/ratelimits";
import { clientIp } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = limits.quote.check(await clientIp());
  if (!rl.ok) return NextResponse.json({ error: "Too many requests, slow down a little." }, { status: 429 });
  const body = await req.json().catch(() => null);
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart", issues: parsed.error.flatten() }, { status: 400 });
  const q = await quoteCart(parsed.data.lines);
  return NextResponse.json(publicQuote(q));
}
