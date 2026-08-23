// Time handling for DayOS.
//
// TravelOS's dates.ts deals in CALENDAR DAYS — "spring break starts March 23"
// is true in every timezone, so those are stored at UTC midnight. DayOS needs
// the opposite thing: INSTANTS. "Dance class at 5:00 PM" is a specific moment
// that a person has to physically be somewhere for, and getting it wrong by an
// hour twice a year (when DST flips) means missing a pickup.
//
// So this module keeps three representations strictly separate:
//
//   DayKey       "2026-08-24"  — a calendar day (reuses travelos/dates.ts)
//   MinuteOfDay  1020          — a wall-clock time, 0..1439, no date, no zone
//   Date         an instant    — always UTC internally, rendered in a zone
//
// A recurring activity stores a MinuteOfDay ("17:00") and never an instant,
// because "5 PM every Tuesday" survives a DST change and "2026-03-08T01:00Z"
// does not. The instant is resolved per-occurrence, in the household's zone,
// through zonedTimeToUtc() below.
//
// No date library. Intl.DateTimeFormat already carries the full IANA database
// in Node and every browser; the ~40 lines below are the whole conversion.

import { dayKey, parseDay, utcDay } from "@/lib/travelos/dates";

/** Minutes since local midnight, 0..1439. */
export type MinuteOfDay = number;

export const MINUTES_PER_DAY = 1440;

/** Parse "17:00" / "5:00 PM" / "17:00:00" to minutes since midnight. */
export function parseMinuteOfDay(value: string | null | undefined): MinuteOfDay | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();

  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/.exec(trimmed);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3] === "PM") hour += 12;
    const minute = Number(ampm[2]);
    if (minute > 59) return null;
    return hour * 60 + minute;
  }

  const iso = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!iso) return null;
  const hour = Number(iso[1]);
  const minute = Number(iso[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** "17:00" — the canonical storage form. */
export function formatMinuteOfDay(minute: MinuteOfDay): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "5:00 PM" — how a person reads it. */
export function formatClock(minute: MinuteOfDay): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(m / 60);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(m % 60).padStart(2, "0")} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Zone conversion
// ---------------------------------------------------------------------------

/**
 * The UTC offset, in minutes, that `timeZone` was at the given instant.
 * Positive east of Greenwich (America/Los_Angeles in August returns -420).
 */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * Resolve a wall-clock time in a zone to the instant it actually happens.
 *
 * Two candidate instants are produced — one using the offset before any
 * transition, one using the offset after — and then VERIFIED by reading the
 * wall clock back. That verification is the whole point: on the two days a
 * year when the offset changes, a naive conversion is silently an hour wrong,
 * and an hour is the difference between arriving early and missing a pickup.
 *
 *   Normal day       both candidates agree and verify.
 *   Fall back (1:30 AM happens twice) — both verify; we take the EARLIER,
 *                    which is the first 1:30 and what a person means.
 *   Spring forward (2:30 AM never happens) — neither verifies; we take the
 *                    LATER, shifting forward to 3:30, which is what every
 *                    calendar app does. Silently landing on 1:30 — an hour
 *                    BEFORE the requested time — would be the dangerous
 *                    answer, and is what the naive two-pass produces.
 */
export function zonedTimeToUtc(
  day: Date | string,
  minuteOfDay: MinuteOfDay,
  timeZone: string
): Date {
  const d = parseDay(day);
  if (!d) throw new Error(`zonedTimeToUtc: unparseable day ${String(day)}`);

  const wantDay = dayKey(d);
  const naive =
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + minuteOfDay * 60_000;

  const first = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000;
  const second = naive - zoneOffsetMinutes(new Date(first), timeZone) * 60_000;

  const candidates = first === second ? [first] : [first, second];
  const verified = candidates.filter((ts) => {
    const instant = new Date(ts);
    return (
      zonedMinuteOfDay(instant, timeZone) === minuteOfDay &&
      zonedDayKey(instant, timeZone) === wantDay
    );
  });

  return new Date(verified.length > 0 ? Math.min(...verified) : Math.max(...candidates));
}

/** The calendar day an instant falls on, as seen from `timeZone`. */
export function zonedDayKey(instant: Date, timeZone: string): string {
  const offset = zoneOffsetMinutes(instant, timeZone);
  return dayKey(new Date(instant.getTime() + offset * 60_000));
}

/** The wall-clock minute an instant falls on, as seen from `timeZone`. */
export function zonedMinuteOfDay(instant: Date, timeZone: string): MinuteOfDay {
  const offset = zoneOffsetMinutes(instant, timeZone);
  const shifted = new Date(instant.getTime() + offset * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** "5:12 PM" for an instant, in the household's zone. */
export function formatInstant(instant: Date, timeZone: string): string {
  return formatClock(zonedMinuteOfDay(instant, timeZone));
}

/** "Mon" / "Monday" for an instant, in the household's zone. */
export function zonedWeekday(instant: Date, timeZone: string, long = false): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: long ? "long" : "short",
  }).format(instant);
}

/** The local calendar day for "now" in a zone. */
export function todayIn(timeZone: string, now: Date = new Date()): Date {
  const key = zonedDayKey(now, timeZone);
  return utcDay(Number(key.slice(0, 4)), Number(key.slice(5, 7)), Number(key.slice(8, 10)));
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 60_000;
}

/**
 * "in 12 minutes" / "in 1 hr 5 min" / "8 minutes ago". Used in every reminder,
 * so it rounds the way a person would say it rather than showing 0 minutes for
 * anything under a minute.
 */
export function describeMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const rounded = abs < 1 ? 1 : Math.round(abs);
  const body =
    rounded < 60
      ? `${rounded} min`
      : rounded % 60 === 0
        ? `${rounded / 60} hr`
        : `${Math.floor(rounded / 60)} hr ${rounded % 60} min`;
  return minutes < 0 ? `${body} ago` : `in ${body}`;
}

/** Day-of-week as 0=Sunday..6=Saturday for a calendar day. */
export function weekdayIndex(day: Date): number {
  const d = parseDay(day);
  if (!d) throw new Error("weekdayIndex: unparseable day");
  return d.getUTCDay();
}

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
