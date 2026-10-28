import { PrismaClient } from "@prisma/client";

// DATABASE_URL, or the pooled URL that Vercel's Supabase/Neon integrations inject.
export const databaseUrl =
  process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || undefined;

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
