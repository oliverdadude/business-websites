import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, SESSION_HOURS, verifySessionToken } from "@/lib/auth/session";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

export async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return verifySessionToken(c.get(SESSION_COOKIE)?.value);
}

/** Call at the top of every admin page and server action. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 30;

export async function attemptLogin(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await clientIp();
  const since = new Date(Date.now() - WINDOW_MS);
  const [ipFails, allFails] = await Promise.all([
    prisma.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: since } } }),
  ]);
  if (ipFails >= MAX_FAILS_PER_IP || allFails >= MAX_FAILS_GLOBAL) {
    return { ok: false, error: "Too many failed attempts. Try again in 15 minutes." };
  }
  const hash = process.env.ADMIN_PASSWORD_HASH ?? "";
  if (!hash) return { ok: false, error: "ADMIN_PASSWORD_HASH is not set. Run npm run admin:hash and add it to your environment." };
  const ok = typeof password === "string" && password.length <= 200 && verifyPassword(password, hash);
  await prisma.loginAttempt.create({ data: { ip, success: ok } });
  // Old attempts are only needed for the throttle window.
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
  if (!ok) return { ok: false, error: "Incorrect password." };

  const c = await cookies();
  c.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return { ok: true };
}

export async function logout() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}
