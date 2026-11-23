import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

let prismaClient: PrismaClient;

if (globalForPrisma.prisma) {
  // Dev reloads this module often: reuse the client (and its warm pool).
  prismaClient = globalForPrisma.prisma;
} else if (process.env.DATABASE_URL) {
  // Opening a connection to the database takes ~3 s from here (TLS and auth
  // over a long round trip), a query on an open one ~0.3 s. pg closes idle
  // connections after 10 s by default, so nearly every page load paid for a
  // new one; keep them open for 10 minutes instead.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, idleTimeoutMillis: 10 * 60_000, keepAlive: true });
  // node-postgres emits 'error' on the pool for problems with idle clients
  // (e.g. Neon closing a connection server-side after its own idle
  // timeout) — without a listener, that's an unhandled event that can
  // crash the whole process instead of just failing the next query.
  pool.on("error", (err) => {
    console.error("Unexpected error on idle Postgres client:", err);
  });
  const adapter = new PrismaPg(pool);
  prismaClient = new PrismaClient({ adapter });
} else {
  // Fallback for build phase when DATABASE_URL environment variable is not present
  prismaClient = new PrismaClient();
}

export const prisma = prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
