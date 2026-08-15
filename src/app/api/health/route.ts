import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

// Railway's health check hits this before routing traffic to a new
// deploy. Checks both Postgres and Redis are actually reachable, not just
// that the Next.js process is up — a "the server started" health check
// would happily pass while the database is unreachable.
export async function GET() {
  const [dbResult, redisResult] = await Promise.allSettled([
    db.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const dbOk = dbResult.status === "fulfilled";
  const redisOk = redisResult.status === "fulfilled";
  const ok = dbOk && redisOk;

  return NextResponse.json(
    {
      ok,
      database: dbOk ? "ok" : "unreachable",
      redis: redisOk ? "ok" : "unreachable",
    },
    { status: ok ? 200 : 503 }
  );
}
