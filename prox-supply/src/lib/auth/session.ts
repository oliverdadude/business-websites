// Signed admin session (HS256 JWT via jose). Edge-safe: used by middleware too.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "prx_admin";
export const SESSION_HOURS = 12;

function key(): Uint8Array {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .setAudience("prox-supply-admin")
    .sign(key());
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "prox-supply-admin", algorithms: ["HS256"] });
    return payload.role === "admin";
  } catch {
    return false;
  }
}
