import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Prisma 7's client requires an explicit driver adapter — no bundled query
// engine binary anymore. This is the SQLite one; swapping to Postgres later
// is a one-line adapter swap here, nothing else in the app changes.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

// Standard Next.js dev-mode singleton so hot-reload doesn't spin up a new
// PrismaClient (and a new SQLite connection) on every file save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
