import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7's client requires an explicit driver adapter — no bundled query
// engine binary anymore. Postgres everywhere now (local dev via
// docker-compose, production via Railway's managed Postgres) — same
// connection string shape, no per-environment schema branching.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

// Standard Next.js dev-mode singleton so hot-reload doesn't spin up a new
// PrismaClient (and a new SQLite connection) on every file save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
