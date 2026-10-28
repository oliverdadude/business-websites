import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { createRateLimiter } from "@/lib/ratelimit";

describe("admin password", () => {
  it("hashes with scrypt and verifies", () => {
    const h = hashPassword("correct horse battery", 1024);
    expect(h).toMatch(/^scrypt:1024:[\w-]+:[\w-]+$/);
    expect(h).not.toContain("$");
    expect(verifyPassword("correct horse battery", h)).toBe(true);
    expect(verifyPassword("wrong password", h)).toBe(false);
    expect(hashPassword("correct horse battery", 1024)).not.toBe(h); // random salt
  });

  it("rejects malformed hashes and short passwords", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt:1:2:3")).toBe(false);
    expect(verifyPassword("x", "scrypt:abc:salt:hash")).toBe(false);
    expect(() => hashPassword("short")).toThrow();
  });
});

describe("admin session", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
  });
  it("signs and verifies session tokens", async () => {
    const t = await createSessionToken();
    expect(await verifySessionToken(t)).toBe(true);
    expect(await verifySessionToken(t.slice(0, -2) + "xx")).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
  });
  it("rejects tokens signed with another secret", async () => {
    const t = await createSessionToken();
    process.env.SESSION_SECRET = "another-secret-another-secret-another-1";
    expect(await verifySessionToken(t)).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("a", 10).ok).toBe(true);
    const third = rl.check("a", 20);
    expect(third.ok).toBe(false);
    expect(third.retryAfterMs).toBe(980);
    expect(rl.check("b", 20).ok).toBe(true);
    expect(rl.check("a", 1001).ok).toBe(true);
  });
});
