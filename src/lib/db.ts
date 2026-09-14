import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

let prismaClient: PrismaClient;

if (process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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

export const prisma = globalForPrisma.prisma || prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
