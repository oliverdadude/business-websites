import { NextResponse } from "next/server";
import { checkoutSchema } from "@/lib/schemas";
import { createOrder } from "@/server/orders";
import { limits } from "@/server/ratelimits";
import { clientIp } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    const f = parsed.error.flatten();
    const first = Object.values(f.fieldErrors).flat()[0] ?? f.formErrors[0] ?? "Please check your details";
    return NextResponse.json({ error: first, fieldErrors: f.fieldErrors }, { status: 400 });
  }
  const rl = limits.order.check(await clientIp());
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many orders from your connection. Try again in ${Math.ceil(rl.retryAfterMs / 60000)} min.` },
      { status: 429 },
    );
  }
  const r = await createOrder(parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error, details: r.details }, { status: r.status });
  return NextResponse.json({ number: r.number, trackingUrl: `/track/${r.number}/${r.token}` }, { status: 201 });
}
