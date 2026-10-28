#!/usr/bin/env bash
# Vercel build: sync the database schema, add the real raw resources (idempotent), then build.
# Uses a direct (non-pooled) connection for schema changes when the integration provides one.
set -euo pipefail

POOLED="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-${POSTGRES_URL:-}}}"
DIRECT="${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-${DATABASE_URL_UNPOOLED:-$POOLED}}}"

npx prisma generate
if [ -n "$DIRECT" ]; then
  # Never drops data: db push refuses destructive changes without --accept-data-loss.
  DATABASE_URL="$DIRECT" npx prisma db push --skip-generate
  DATABASE_URL="$DIRECT" npx tsx scripts/seed.ts
else
  echo "No database connection configured; skipping schema sync. Connect a Postgres database in Vercel → Storage."
fi
npx next build
