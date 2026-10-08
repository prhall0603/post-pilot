import { PrismaClient } from "@prisma/client";

// Dyad/Supabase may expose the connection string under different names
// depending on the environment (dev preview vs. isolated test runs).
// instrumentation.ts may also assign DATABASE_URL at boot in preview mode.
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRESQL_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  "";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(DATABASE_URL ? { datasources: { db: { url: DATABASE_URL } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;