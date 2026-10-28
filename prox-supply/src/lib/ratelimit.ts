// Basic in-memory sliding-window rate limiter. Per server instance (fine for one seller;
// on serverless each instance keeps its own window).
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    check(key: string, now = Date.now()): { ok: boolean; retryAfterMs: number } {
      const since = now - opts.windowMs;
      const list = (hits.get(key) ?? []).filter((t) => t > since);
      if (list.length >= opts.limit) {
        hits.set(key, list);
        return { ok: false, retryAfterMs: list[0] + opts.windowMs - now };
      }
      list.push(now);
      hits.set(key, list);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (!v.some((t) => t > since)) hits.delete(k);
      }
      return { ok: true, retryAfterMs: 0 };
    },
  };
}
