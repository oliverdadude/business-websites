// Helpers for reading FormData in server actions.
export type ActionResult = { ok: boolean; message: string; data?: unknown } | null;

export function fdStr(fd: FormData, k: string, max = 2000): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function fdBool(fd: FormData, k: string): boolean {
  const v = fd.get(k);
  return v === "on" || v === "true" || v === "1";
}

/** Optional whole number: blank → null. Throws on invalid input. */
export function fdIntOrNull(fd: FormData, k: string, label: string, min = 0): number | null {
  const s = fdStr(fd, k).replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > 2_000_000_000) throw new FormError(`${label} must be a whole number of at least ${min}`);
  return n;
}

export function fdInt(fd: FormData, k: string, label: string, min = 0, fallback?: number): number {
  const n = fdIntOrNull(fd, k, label, min);
  if (n === null) {
    if (fallback !== undefined) return fallback;
    throw new FormError(`${label} is required`);
  }
  return n;
}

export function fdFloat(fd: FormData, k: string, label: string, min: number, max: number, fallback: number): number {
  const s = fdStr(fd, k).replace(/[%\s]/g, "");
  if (s === "") return fallback;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) throw new FormError(`${label} must be between ${min} and ${max}`);
  return n;
}

export function fdEnum<T extends string>(fd: FormData, k: string, values: readonly T[], fallback: T): T {
  const s = fdStr(fd, k);
  return (values as readonly string[]).includes(s) ? (s as T) : fallback;
}

export class FormError extends Error {}
