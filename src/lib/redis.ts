import Redis from "ioredis";

// Provisioned and connected, but nothing depends on it yet — same
// "registered, not deeply used" pattern as PropertyOS/HealthOS in the
// module registry. No feature reads/writes through this today, so there's
// no cache-invalidation surface to get wrong. See DESIGN.md.
//
// Next.js dev-mode singleton so hot-reload doesn't open a new connection
// on every file save (mirrors src/lib/db.ts).

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    // Fail fast instead of buffering commands indefinitely if Redis is
    // ever unreachable — this is optional infrastructure, not on the
    // critical path for any request today.
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
