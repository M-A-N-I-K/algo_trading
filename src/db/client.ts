// Re-exports the app's single Prisma client singleton (src/lib/db.ts).
// Deliberately not a second `new PrismaClient()` instantiation — that would
// open a second connection pool against the same pooled Postgres endpoint.
//
// Uses a relative import (not the `@/*` alias) so this also resolves when
// run directly via `tsx` (e.g. src/db/seed.ts), matching the existing CLI
// scripts under src/backtest/, which don't rely on Next.js's bundler for
// path-alias resolution.
export { prisma } from "../lib/db";
