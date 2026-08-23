// The only file in DayOS that talks to a routing provider.
//
// Two constraints shape it, and both are about money and trust rather than
// about code:
//
// COST. The proactive loop ticks every few minutes across every household. A
// naive implementation asks the Distance Matrix API for every upcoming
// departure on every tick, which is thousands of billable calls a day for a
// handful of families. So estimates are cached in a 15-minute departure
// bucket per weekday: "how long is Home → school if I leave at 3:15 PM on a
// Tuesday" is a stable fact, and the answer from last Tuesday is a better
// input than no answer at all.
//
// HONESTY. A cached reading from a previous week is NOT current traffic, and
// the difference matters when an accident just closed a lane. Every estimate
// therefore carries its `quality`: LIVE means this bucket was priced today,
// TYPICAL means it's the same slot on an earlier day. The UI and the messages
// say "typically 24 min" for TYPICAL and "24 min right now" for LIVE — the
// same distinction TravelOS makes about cached flight fares, for the same
// reason.
//
// Without GOOGLE_MAPS_API_KEY the module degrades to a MOCK provider rather
// than failing: every other part of DayOS — rotations, confirmations, the
// brief — still works, and the leave times are marked as estimates.

import { db } from "@/lib/db";
import { zonedDayKey, zonedMinuteOfDay } from "@/lib/dayos/time";

export type EstimateQuality = "LIVE" | "TYPICAL" | "MOCK";

export interface TravelEstimateResult {
  minutes: number;
  quality: EstimateQuality;
  provider: "GOOGLE" | "MOCK";
  observedAt: Date;
  /** True when nothing was charged for this answer. */
  fromCache: boolean;
}

export interface RoutePoint {
  /** Stable identity for the cache key: a Place id, or a hash of an address. */
  key: string;
  address: string;
}

export const BUCKET_MINUTES = 15;

/** How long a LIVE reading counts as current before it's demoted to TYPICAL. */
export const LIVE_TTL_MINUTES = 20;

/** How old a same-bucket reading may be and still be worth reusing. */
export const TYPICAL_MAX_AGE_DAYS = 21;

/** The mock provider's answer. Deterministic so dev behaves predictably. */
export const MOCK_MINUTES = 20;

/**
 * Dev-only override for the mock answer, read from the environment on every
 * call.
 *
 * Without a routing key the mock returns a constant, which means the whole
 * re-timing path — the thing that makes this module more than a static
 * reminder — cannot be exercised at all in development. This is the smallest
 * hook that lets a test change the traffic. It is ignored whenever a real key
 * is configured, so it cannot affect production behaviour even if it is left
 * set in an environment by accident.
 */
export function mockMinutes(): number {
  const raw = process.env.DAYOS_MOCK_TRAVEL_MINUTES;
  if (!raw) return MOCK_MINUTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : MOCK_MINUTES;
}

export function departureBucket(departAt: Date, timeZone: string): number {
  const minute = zonedMinuteOfDay(departAt, timeZone);
  return Math.floor(minute / BUCKET_MINUTES) * BUCKET_MINUTES;
}

export function weekdayIn(departAt: Date, timeZone: string): number {
  const key = zonedDayKey(departAt, timeZone);
  return new Date(`${key}T00:00:00.000Z`).getUTCDay();
}

/** A stable cache key for a free-text address, when there's no Place row. */
export function addressKey(address: string): string {
  const normalized = address.trim().toLowerCase().replace(/\s+/g, " ");
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `addr:${(hash >>> 0).toString(36)}`;
}

function mapsKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function routingEnabled(): boolean {
  return mapsKey() !== null;
}

/**
 * Driving minutes from origin to destination, leaving at `departAt`.
 *
 * `departAt` is not optional and is never defaulted to now — asking about now
 * for a departure two hours away is the mistake this whole module is built to
 * avoid. See solveDeparture() in leave.ts for how the caller closes the loop
 * between "when do I leave" and "how long does it take".
 */
export async function estimateTravel(
  householdId: string,
  origin: RoutePoint,
  destination: RoutePoint,
  departAt: Date,
  timeZone: string
): Promise<TravelEstimateResult> {
  const weekday = weekdayIn(departAt, timeZone);
  const bucket = departureBucket(departAt, timeZone);
  const now = new Date();

  const cached = await db.travelEstimate.findUnique({
    where: {
      householdId_originKey_destinationKey_weekday_departureBucket: {
        householdId,
        originKey: origin.key,
        destinationKey: destination.key,
        weekday,
        departureBucket: bucket,
      },
    },
  });

  if (cached) {
    const ageMinutes = (now.getTime() - cached.observedAt.getTime()) / 60_000;
    if (cached.quality === "LIVE" && ageMinutes <= LIVE_TTL_MINUTES) {
      return {
        minutes: cached.minutes,
        quality: "LIVE",
        provider: cached.provider === "MOCK" ? "MOCK" : "GOOGLE",
        observedAt: cached.observedAt,
        fromCache: true,
      };
    }
  }

  const live = await fetchLive(origin, destination, departAt);
  if (live !== null) {
    await upsertEstimate(householdId, origin, destination, weekday, bucket, live, "GOOGLE", "LIVE");
    return { minutes: live, quality: "LIVE", provider: "GOOGLE", observedAt: now, fromCache: false };
  }

  // No live answer. A same-bucket reading from a recent week beats nothing,
  // and beats a guess — but it is labelled TYPICAL all the way to the message.
  if (cached) {
    const ageDays = (now.getTime() - cached.observedAt.getTime()) / 86_400_000;
    if (ageDays <= TYPICAL_MAX_AGE_DAYS) {
      return {
        minutes: cached.minutes,
        quality: cached.provider === "MOCK" ? "MOCK" : "TYPICAL",
        provider: cached.provider === "MOCK" ? "MOCK" : "GOOGLE",
        observedAt: cached.observedAt,
        fromCache: true,
      };
    }
  }

  const mocked = mockMinutes();
  await upsertEstimate(
    householdId, origin, destination, weekday, bucket, mocked, "MOCK", "TYPICAL"
  );
  return {
    minutes: mocked,
    quality: "MOCK",
    provider: "MOCK",
    observedAt: now,
    fromCache: false,
  };
}

async function upsertEstimate(
  householdId: string,
  origin: RoutePoint,
  destination: RoutePoint,
  weekday: number,
  bucket: number,
  minutes: number,
  provider: "GOOGLE" | "MOCK",
  quality: "LIVE" | "TYPICAL"
) {
  const where = {
    householdId_originKey_destinationKey_weekday_departureBucket: {
      householdId,
      originKey: origin.key,
      destinationKey: destination.key,
      weekday,
      departureBucket: bucket,
    },
  };
  await db.travelEstimate.upsert({
    where,
    create: {
      householdId,
      originKey: origin.key,
      destinationKey: destination.key,
      weekday,
      departureBucket: bucket,
      minutes,
      provider,
      quality,
    },
    update: { minutes, provider, quality, observedAt: new Date() },
  });
}

/**
 * One Distance Matrix call. Returns null — never throws and never guesses —
 * when the key is missing or the provider is unhappy, so the caller can fall
 * back to a labelled estimate instead of surfacing an error to a parent who
 * just wants to know when to leave.
 */
async function fetchLive(
  origin: RoutePoint,
  destination: RoutePoint,
  departAt: Date
): Promise<number | null> {
  const key = mapsKey();
  if (!key) return null;

  // The API rejects a departure_time in the past; "now" is the closest legal
  // request and is the right answer for an imminent departure anyway.
  const departureTime = Math.max(
    Math.floor(departAt.getTime() / 1000),
    Math.floor(Date.now() / 1000)
  );

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", origin.address);
  url.searchParams.set("destinations", destination.address);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("departure_time", String(departureTime));
  url.searchParams.set("traffic_model", "best_guess");
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status?: string;
      rows?: {
        elements?: {
          status?: string;
          duration?: { value: number };
          duration_in_traffic?: { value: number };
        }[];
      }[];
    };
    if (body.status !== "OK") return null;

    const element = body.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") return null;

    const seconds = element.duration_in_traffic?.value ?? element.duration?.value;
    if (typeof seconds !== "number") return null;
    return Math.max(1, Math.round(seconds / 60));
  } catch {
    return null;
  }
}

/** How an estimate should be described in a message. */
export function describeQuality(result: TravelEstimateResult): string {
  switch (result.quality) {
    case "LIVE":
      return `${result.minutes} min right now`;
    case "TYPICAL":
      return `typically ${result.minutes} min at this time`;
    case "MOCK":
      return `about ${result.minutes} min (estimated — no routing key configured)`;
  }
}
