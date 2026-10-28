import "server-only";
import { prisma } from "./db";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings-core";

export { DEFAULT_SETTINGS, type Settings };

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in out) {
      try {
        (out as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
      } catch {
        /* ignore malformed setting */
      }
    }
  }
  return out;
}

export async function saveSettings(patch: Partial<Settings>) {
  await prisma.$transaction(
    Object.entries(patch).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: { key, value: JSON.stringify(value) },
      }),
    ),
  );
}
