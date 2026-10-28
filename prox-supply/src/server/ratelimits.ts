import "server-only";
import { createRateLimiter } from "@/lib/ratelimit";

const g = globalThis as unknown as { __prxLimits?: Record<string, ReturnType<typeof createRateLimiter>> };
g.__prxLimits ??= {
  quote: createRateLimiter({ limit: 120, windowMs: 60_000 }),
  order: createRateLimiter({ limit: 5, windowMs: 10 * 60_000 }),
};
export const limits = g.__prxLimits;
