// Admin password hashing with scrypt. Format: scrypt:<N>:<saltB64url>:<hashB64url>
// (no "$" characters, so it is safe inside .env files that expand variables).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

export function hashPassword(password: string, N = 16384): string {
  if (password.length < 8) throw new Error("Use a password of at least 8 characters");
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: 8, p: 1 });
  return `scrypt:${N}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.trim().split(":");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  if (!Number.isInteger(N) || N < 1024 || N > 1 << 20) return false;
  const salt = Buffer.from(parts[2], "base64url");
  const expected = Buffer.from(parts[3], "base64url");
  if (expected.length !== KEYLEN) return false;
  const actual = scryptSync(password, salt, KEYLEN, { N, r: 8, p: 1, maxmem: 256 * N * 8 });
  return timingSafeEqual(actual, expected);
}
