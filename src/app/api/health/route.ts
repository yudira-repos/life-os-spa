import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

// Railway's health check hits this before routing traffic to a new deploy, so
// what it treats as fatal decides whether a deploy goes live at all.
//
// Postgres is fatal: every page and every API route reads from it, and a
// deploy that cannot reach the database is not serving anything. Reporting
// "the server started" while the database is unreachable would be a useless
// check.
//
// Redis is NOT fatal, and that distinction is deliberate. See lib/redis.ts —
// it is provisioned but nothing reads or writes through it yet; this route is
// its only importer. Failing the deploy on it meant a Railway project without
// a Redis service could never ship a healthy release, because a check on an
// unused dependency was gating a working app. It is still reported, so when
// something does start depending on it the status is already visible.
export async function GET() {
  const [dbResult, redisResult] = await Promise.allSettled([
    db.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const dbOk = dbResult.status === "fulfilled";
  const redisOk = redisResult.status === "fulfilled";

  return NextResponse.json(
    {
      ok: dbOk,
      database: dbOk ? "ok" : "unreachable",
      // "unused" rather than "unreachable" when there's no Redis configured at
      // all — an operator reading this should not go hunting for a broken
      // service that was never meant to exist yet.
      redis: redisOk ? "ok" : process.env.REDIS_URL ? "unreachable" : "unused",
    },
    { status: dbOk ? 200 : 503 }
  );
}
